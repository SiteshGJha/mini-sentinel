#!/bin/bash
# Idea to Production (I2P) Local Initializer Script

set -e

# Helper: Print styled messages
log_info() {
  echo -e "\033[1;34m[I2P Info]\033[0m $1"
}

log_success() {
  echo -e "\033[1;32m[I2P Success]\033[0m $1"
}

log_error() {
  echo -e "\033[1;31m[I2P Error]\033[0m $1"
}

# Check input
if [ -z "$1" ]; then
  log_error "Please provide a name for the new idea/feature."
  echo "Usage: ./scripts/init-idea.sh \"My Awesome Feature\""
  exit 1
fi

FEATURE_NAME="$1"
# Slugify feature name (replace spaces and symbols with hyphens, lowercase)
FEATURE_SLUG=$(echo "$FEATURE_NAME" | iconv -t ascii//TRANSLIT | tr -cd '[:alnum:]_.- ' | tr ' ' '-' | tr '[:upper:]' '[:lower:]')

log_info "Initializing directories and files for feature: '${FEATURE_NAME}' (${FEATURE_SLUG})..."

# Define template paths
TEMPLATE_SPEC="repo-template/docs/product-specs/template.md"
TEMPLATE_DESIGN="repo-template/docs/design-docs/template.md"
TEMPLATE_EXEC="repo-template/docs/exec-plans/template.md"

# Define target paths
TARGET_SPEC="docs/product-specs/${FEATURE_SLUG}.md"
TARGET_DESIGN_DIR="docs/design-docs/${FEATURE_SLUG}"
TARGET_DESIGN="${TARGET_DESIGN_DIR}/index.md"
TARGET_EXEC="docs/exec-plans/active/${FEATURE_SLUG}-v1.md"

# Create directories if they don't exist
mkdir -p "docs/product-specs"
mkdir -p "${TARGET_DESIGN_DIR}"
mkdir -p "docs/exec-plans/active"
mkdir -p "docs/exec-plans/completed"
mkdir -p "docs/exec-plans/archived"
mkdir -p "docs/references"
mkdir -p "docs/generated"

# Copy templates if they don't already exist
if [ ! -f "${TARGET_SPEC}" ]; then
  cp "${TEMPLATE_SPEC}" "${TARGET_SPEC}"
  # Replace placeholder with actual name using python for portability
  python3 -c "
import sys
f = sys.argv[1]
name = sys.argv[2]
content = open(f).read().replace('Feature Spec Template', name + ' Product Spec')
open(f, 'w').write(content)
" "${TARGET_SPEC}" "${FEATURE_NAME}"
  log_success "Created Product Spec: ${TARGET_SPEC}"
else
  log_info "Product Spec already exists: ${TARGET_SPEC}. Skipping."
fi

if [ ! -f "${TARGET_DESIGN}" ]; then
  cp "${TEMPLATE_DESIGN}" "${TARGET_DESIGN}"
  python3 -c "
import sys
f = sys.argv[1]
name = sys.argv[2]
content = open(f).read().replace('Solution Design Template', name + ' Technical Design')
open(f, 'w').write(content)
" "${TARGET_DESIGN}" "${FEATURE_NAME}"
  log_success "Created Design Doc: ${TARGET_DESIGN}"
else
  log_info "Design Doc already exists: ${TARGET_DESIGN}. Skipping."
fi

if [ ! -f "${TARGET_EXEC}" ]; then
  cp "${TEMPLATE_EXEC}" "${TARGET_EXEC}"
  python3 -c "
import sys
f = sys.argv[1]
name = sys.argv[2]
content = open(f).read().replace('Execution Plan Template', name + ' Execution Plan')
open(f, 'w').write(content)
" "${TARGET_EXEC}" "${FEATURE_NAME}"
  log_success "Created Execution Plan: ${TARGET_EXEC}"
else
  log_info "Execution Plan already exists: ${TARGET_EXEC}. Skipping."
fi

# Append to PLANS.md if PLANS.md exists
if [ -f "PLANS.md" ]; then
  # Check if already registered
  if grep -q "${FEATURE_SLUG}" PLANS.md; then
    log_info "Feature already registered in PLANS.md."
  else
    # Format a table row for PLANS.md
    PLAN_ROW="| ${FEATURE_NAME} | Stage 0 | [Spec](file:///docs/product-specs/${FEATURE_SLUG}.md) | [Design](file:///docs/design-docs/${FEATURE_SLUG}/index.md) | [Plan](file:///docs/exec-plans/active/${FEATURE_SLUG}-v1.md) | TBD | Draft |"
    # Insert row right after the first divider row (containing ---)
    python3 -c "
import sys
row = sys.argv[1]
content = open('PLANS.md').read()
if row not in content:
    lines = content.splitlines()
    inserted = False
    for idx, line in enumerate(lines):
        if '---|' in line or '|---|' in line or '| :---' in line:
            lines.insert(idx + 1, row)
            inserted = True
            break
    if not inserted:
        lines.append(row)
    open('PLANS.md', 'w').write('\n'.join(lines) + '\n')
" "${PLAN_ROW}"
    log_success "Registered '${FEATURE_NAME}' in PLANS.md"
  fi
fi

log_success "Successfully initialized feature governance for: ${FEATURE_NAME}!"
echo -e "\nWhat to do next:"
echo -e "  1. Fill in the Product Spec: ${TARGET_SPEC}"
echo -e "  2. Design the technical flow: ${TARGET_DESIGN}"
echo -e "  3. Break down tasks in the Execution Plan: ${TARGET_EXEC}"
echo -e "  4. Update PLANS.md, ARCHITECTURE.md, and start coding!"
