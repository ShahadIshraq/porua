#ifndef ScreenCapture_Bridging_Header_h
#define ScreenCapture_Bridging_Header_h

#include <stdint.h>
#include <stdbool.h>

// Permission management
bool screen_capture_check_permission(void);
bool screen_capture_request_permission(void);

// Screen capture
const char* screen_capture_region(int32_t x, int32_t y, int32_t width, int32_t height);

// OCR
const char* screen_capture_ocr(const char* base64_image);

// Display information
const char* screen_capture_get_displays(void);

// Memory management
void screen_capture_free_string(char* ptr);

#endif /* ScreenCapture_Bridging_Header_h */
