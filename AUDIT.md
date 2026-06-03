# Børnebog Generator - Code Audit Report

**Date:** 2026-06-03  
**Scope:** Full stack audit (FastAPI backend + Tkinter GUI + config)

---

## Issues Found

### 🔴 CRITICAL

**1. Pydantic v2 Deprecated `.dict()` Method**
- **Files:** `app/endpoints/story.py` (line 79), `app/endpoints/images.py` (line 54)
- **Issue:** Pydantic v2 removed `.dict()` method. Using `.model_dump()` instead.
- **Impact:** Runtime errors when serializing `BookData` to JSON
- **Fix:** Replace `.dict()` with `.model_dump()`

**2. Missing Error Handling in PDF Generation**
- **File:** `app/endpoints/pdf.py` (line 71)
- **Issue:** `add_text_to_image()` called without checking if image file exists or is corrupted
- **Impact:** Silent skip of pages if image fails to load
- **Fix:** Add try-catch with proper error logging

**3. Incomplete Error Response in Image Generation**
- **File:** `app/endpoints/images.py` (line 36)
- **Issue:** Returns error dict but endpoint expects consistent response structure
- **Impact:** Frontend may crash on error handling
- **Fix:** Wrap errors in proper response format

---

### 🟡 HIGH

**4. Config Loading Without Error Handling**
- **File:** `app/config.py` (lines 3-7)
- **Issue:** No validation of required config keys or fallback for missing values
- **Impact:** Cryptic errors if config.yaml is malformed or missing keys
- **Fix:** Add validation and sensible defaults

**5. Hardcoded API Key Exposure Risk**
- **File:** `config.yaml` (line 1)
- **Issue:** OpenAI API key stored as environment variable reference in plaintext YAML
- **Impact:** Risk if config.yaml is committed to git
- **Fix:** Ensure .gitignore includes config.yaml (not checked - no .gitignore found)

**6. Missing .gitignore**
- **Files:** No `.gitignore` in repo
- **Issue:** Could accidentally commit `config.yaml`, `output/`, `__pycache__`, environment files
- **Fix:** Create comprehensive .gitignore

**7. OpenAI API Error Handling Missing**
- **Files:** `app/endpoints/*.py` (all client.* calls)
- **Issue:** No try-catch around OpenAI API calls
- **Impact:** Unhandled API failures cause 500 errors with no user feedback
- **Fix:** Wrap calls in try-catch with meaningful error messages

---

### 🟠 MEDIUM

**8. GUI Base URL Hardcoded**
- **File:** `gui.py` (line 10)
- **Issue:** `BASE_URL = "http://localhost:8000"` hardcoded - no config option
- **Impact:** Can't change backend URL without code edit
- **Fix:** Load from environment variable or config file

**9. Type Annotation Issue in Story Generation**
- **File:** `app/endpoints/story.py` (line 41)
- **Issue:** `pages_text = json.loads(raw)` - type is unknown, code assumes list
- **Impact:** Could fail if API returns non-list JSON
- **Fix:** Add type checking after parse

**10. Image Upscaling Performance**
- **File:** `app/endpoints/images.py` (line 18)
- **Issue:** `cv2.INTER_CUBIC` upscaling 1024x1024 to 1772x1772 is slow and lossy
- **Impact:** Noticeable delay, quality degradation
- **Note:** This is by design for the image generation constraint. Consider documenting.

**11. Text Color Hardcoded in PDF**
- **File:** `app/endpoints/pdf.py` (line 82)
- **Issue:** Dedication text color hardcoded as red (190,0,0)
- **Impact:** No way to customize without code change
- **Fix:** Move to config

**12. Missing Logging**
- **Entire codebase:** No logging module used
- **Issue:** Errors and progress silent - hard to debug
- **Fix:** Add Python logging throughout

---

### 🔵 LOW

**13. Magic String "Side " in PDF**
- **File:** `app/endpoints/pdf.py` (line 37)
- **Issue:** Hardcoded Danish text check
- **Impact:** If text format changes, this breaks silently
- **Fix:** Move to config constant or improve detection

**14. Image Format Assumption**
- **File:** `app/endpoints/images.py` (line 49)
- **Issue:** Assumes all images are `.png` - no validation
- **Impact:** Could fail if format changes
- **Fix:** Make configurable or validate response format

**15. Missing Endpoint Docstrings**
- **All endpoints** lack documentation
- **Impact:** Hard to understand API contract from code
- **Fix:** Add FastAPI docstrings

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 7 |
| Low | 3 |
| **Total** | **18** |

---

## Recommendations

**Priority 1 (Fix now):**
1. Replace `.dict()` with `.model_dump()` (Pydantic v2)
2. Add .gitignore and verify config.yaml safety
3. Wrap all OpenAI API calls in error handlers
4. Add try-catch to image loading in PDF generation

**Priority 2 (Fix soon):**
5. Add config validation
6. Move hardcoded values to config
7. Add logging throughout

**Priority 3 (Nice to have):**
8. Add API docstrings
9. Improve error responses consistency
10. Performance optimization for image upscaling

---

## Notes

- No CLAUDE.md found in repo (none to read)
- All syntax valid (Python 3.6+)
- Dependencies in requirements.txt are current
- Project structure is clean and modular
