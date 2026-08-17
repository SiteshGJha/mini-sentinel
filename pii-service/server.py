import asyncio
import json
import logging
import os
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pii-service")

# Setup Presidio Analyzer with small spaCy model
nlp_configuration = {
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}]
}
provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
nlp_engine = provider.create_engine()
analyzer = AnalyzerEngine(nlp_engine=nlp_engine)


# Add Custom Bank Account Recognizer
bank_pattern = Pattern(
    name="bank_account_pattern",
    regex=r"\b\d{8,17}\b",
    score=0.4
)
bank_recognizer = PatternRecognizer(
    supported_entity="BANK_ACCOUNT",
    patterns=[bank_pattern]
)
analyzer.registry.add_recognizer(bank_recognizer)

# Add custom entity mapping to make sure we support both Presidio and legacy types
ENTITY_TYPE_MAPPING = {
    'US_SSN': 'SSN',
    'CREDIT_CARD': 'CREDIT_CARD',
    'BANK_ACCOUNT': 'BANK_ACCOUNT',
    'EMAIL_ADDRESS': 'EMAIL',
    'PHONE_NUMBER': 'PHONE',
    'LOCATION': 'ADDRESS',
    'PERSON': 'PERSON'
}

def get_mask(entity_type, val):
    if entity_type == 'US_SSN' or entity_type == 'SSN':
        return f"XXX-XX-{val[-4:]}"
    elif entity_type == 'CREDIT_CARD':
        clean = val.replace('-', '').replace(' ', '')
        return f"XXXX-XXXX-XXXX-{clean[-4:]}"
    elif entity_type == 'BANK_ACCOUNT':
        return f"XXXXXX{val[-4:]}"
    elif entity_type in ('LOCATION', 'ADDRESS'):
        return "[REDACTED ADDRESS]"
    elif entity_type in ('EMAIL_ADDRESS', 'EMAIL'):
        if '@' in val:
            parts = val.split('@', 1)
            if len(parts) == 2:
                local, domain = parts
                if local:
                    return f"{local[0]}***@{domain}"
        return "[REDACTED EMAIL]"
    elif entity_type in ('PHONE_NUMBER', 'PHONE'):
        return f"XXX-XXX-{val[-4:]}"
    elif entity_type == 'PERSON':
        return "[REDACTED_NAME]"
    else:
        return "[REDACTED]"

def redact_string(content, path=""):
    # Scan using Presidio
    results = analyzer.analyze(
        text=content,
        language='en',
        entities=['US_SSN', 'CREDIT_CARD', 'BANK_ACCOUNT', 'EMAIL_ADDRESS', 'PHONE_NUMBER', 'LOCATION', 'PERSON']
    )
    
    if not results:
        return content, []
    
    # Sort results by start index descending
    results = sorted(results, key=lambda x: x.start, reverse=True)
    
    # Filter overlaps
    filtered = []
    for res in results:
        overlap = False
        for added in filtered:
            if (res.start >= added.start and res.start < added.end) or (res.end > added.start and res.end <= added.end):
                overlap = True
                break
        if not overlap:
            filtered.append(res)
            
    # Apply redactions from end of string to start to keep offsets valid
    redacted_text = content
    matches = []
    for res in filtered:
        val = redacted_text[res.start:res.end]
        mask = get_mask(res.entity_type, val)
        redacted_text = redacted_text[:res.start] + mask + redacted_text[res.end:]
        
        matches.append({
            "path": path,
            "type": ENTITY_TYPE_MAPPING.get(res.entity_type, res.entity_type)
        })
        
    return redacted_text, matches

def redact_value(val, path=""):
    if val is None:
        return val, []
        
    if isinstance(val, str):
        # Support direct key name checks as a secondary safeguard
        key_name = path.split('.')[-1] if path else ''
        if is_sensitive_key(key_name):
            inferred_type = infer_pii_type_from_key(key_name)
            mask = get_mask(inferred_type, val)
            return mask, [{"path": path, "type": ENTITY_TYPE_MAPPING.get(inferred_type, inferred_type)}]
            
        return redact_string(val, path)
        
    if isinstance(val, list):
        redacted_list = []
        matches = []
        for idx, item in enumerate(val):
            item_redacted, item_matches = redact_value(item, f"{path}[{idx}]" if path else f"[{idx}]")
            redacted_list.append(item_redacted)
            matches.extend(item_matches)
        return redacted_list, matches
        
    if isinstance(val, dict):
        redacted_dict = {}
        matches = []
        for k, v in val.items():
            current_path = f"{path}.{k}" if path else k
            v_redacted, v_matches = redact_value(v, current_path)
            redacted_dict[k] = v_redacted
            matches.extend(v_matches)
        return redacted_dict, matches
        
    return val, []

def is_sensitive_key(key):
    if not key:
        return False
    sensitive_keys = [
        'ssn', 'socialsecurity', 'creditcard', 'ccnumber', 'pan',
        'bankaccount', 'accountnumber', 'routingnumber', 'address',
        'street', 'email', 'phone', 'phonenumber', 'dateofbirth', 'dob'
    ]
    normalized = ''.join(c for c in key.lower() if c.isalpha())
    return any(k in normalized for k in sensitive_keys)

def infer_pii_type_from_key(key):
    k = key.lower()
    if 'ssn' in k or 'social' in k: return 'US_SSN'
    if 'card' in k or 'cc' in k or 'pan' in k: return 'CREDIT_CARD'
    if 'bank' in k or 'account' in k: return 'BANK_ACCOUNT'
    if 'address' in k or 'street' in k: return 'LOCATION'
    if 'email' in k: return 'EMAIL_ADDRESS'
    return 'PHONE_NUMBER'

async def handle_client(reader, writer):
    addr = writer.get_extra_info('peername')
    logger.info(f"New connection from {addr}")
    
    buffer = b""
    try:
        while True:
            data = await reader.read(8192)
            if not data:
                break
            buffer += data
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                if not line:
                    continue
                try:
                    payload = json.loads(line.decode('utf-8'))
                    params = payload.get("parameters", {})
                    
                    # Process redaction
                    redacted_params, matches = redact_value(params)
                    
                    response = {
                        "redactedParams": redacted_params,
                        "redactedCount": len(matches),
                        "matches": matches
                    }
                    
                    writer.write(json.dumps(response).encode('utf-8') + b"\n")
                    await writer.drain()
                except Exception as ex:
                    logger.error(f"Error parsing/processing data: {ex}")
                    error_resp = {"error": str(ex)}
                    writer.write(json.dumps(error_resp).encode('utf-8') + b"\n")
                    await writer.drain()
    except Exception as e:
        logger.error(f"Connection error with {addr}: {e}")
    finally:
        logger.info(f"Closing connection from {addr}")
        writer.close()
        try:
            await writer.wait_closed()
        except:
            pass

async def main():
    port = int(os.environ.get('PII_SERVICE_PORT', 50051))
    server = await asyncio.start_server(handle_client, '0.0.0.0', port)
    addr = server.sockets[0].getsockname()
    logger.info(f"Serving PII Redaction TCP socket service on {addr}")
    async with server:
        await server.serve_forever()

if __name__ == '__main__':
    asyncio.run(main())
