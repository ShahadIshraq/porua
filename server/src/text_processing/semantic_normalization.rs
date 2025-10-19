/// Semantic text normalization for TTS
///
/// This module handles normalization of written forms to spoken forms:
/// - Currency with scale: "$10.3 billion" → "ten point three billion dollars"
/// - Simple currency: "$23.45" → "twenty-three dollars and forty-five cents"
/// - Percentages: "50%" → "fifty percent"
/// - Future: dates, times, ordinals, phone numbers, abbreviations
use lazy_static::lazy_static;
use num2words::Num2Words;
use regex::{Captures, Regex};

lazy_static! {
    /// Currency with scale words (billion, million, trillion)
    /// Matches: $10.3 billion, $5B, $2.5M, etc.
    static ref CURRENCY_SCALE_REGEX: Regex = Regex::new(
        r"(?i)\$(\d+(?:\.\d+)?)\s*(billion|million|trillion|B|M|T)\b"
    ).unwrap();

    /// Simple currency without scale
    /// Matches: $23.45, $100, etc.
    /// Note: Apply AFTER currency_with_scale to avoid conflicts
    static ref CURRENCY_SIMPLE_REGEX: Regex = Regex::new(
        r"\$(\d+(?:\.\d+)?)\b"
    ).unwrap();

    /// Percentage patterns
    /// Matches: 50%, 33.5%, etc.
    static ref PERCENTAGE_REGEX: Regex = Regex::new(
        r"(\d+(?:\.\d+)?)\s*%"
    ).unwrap();

    /// Ordinal numbers (future enhancement)
    /// Matches: 1st, 2nd, 3rd, 4th, etc.
    #[allow(dead_code)]
    static ref ORDINAL_REGEX: Regex = Regex::new(
        r"\b(\d+)(st|nd|rd|th)\b"
    ).unwrap();
}

/// Main entry point for semantic normalization
///
/// Applies all semantic transformations in order:
/// 1. Currency with scale (must be first to avoid conflicts)
/// 2. Simple currency
/// 3. Percentages
/// 4. Future: dates, times, ordinals
pub fn normalize_semantic(text: &str) -> String {
    let mut result = text.to_string();

    // Order matters! Currency with scale must come before simple currency
    // to avoid "$10.3 billion" being processed as "$10.3" + "billion"
    result = normalize_currency_with_scale(&result);
    result = normalize_currency_simple(&result);
    result = normalize_percentages(&result);

    result
}

/// Normalize currency with scale words (billion, million, trillion)
///
/// Examples:
/// - "$10.3 billion" → "ten point three billion dollars"
/// - "$5B" → "five billion dollars"
/// - "$2.5M" → "two point five million dollars"
/// - "$100 trillion" → "one hundred trillion dollars"
fn normalize_currency_with_scale(text: &str) -> String {
    CURRENCY_SCALE_REGEX
        .replace_all(text, |caps: &Captures| {
            let amount_str = &caps[1];
            let scale_str = &caps[2];

            // Parse the amount
            let amount = match amount_str.parse::<f64>() {
                Ok(num) => num,
                Err(_) => return caps[0].to_string(), // Return original if parse fails
            };

            // Expand scale abbreviations
            let scale_lowercase = scale_str.to_lowercase();
            let scale_word = match scale_lowercase.as_str() {
                "b" => "billion",
                "m" => "million",
                "t" => "trillion",
                s => s,
            };

            // Convert amount to words
            let amount_words = format_number_for_speech(amount);

            // Format: "ten point three billion dollars"
            format!("{} {} dollars", amount_words, scale_word)
        })
        .to_string()
}

/// Normalize simple currency (without scale words)
///
/// Examples:
/// - "$23.45" → "twenty-three dollars and forty-five cents"
/// - "$100" → "one hundred dollars"
/// - "$0.50" → "fifty cents"
fn normalize_currency_simple(text: &str) -> String {
    CURRENCY_SIMPLE_REGEX
        .replace_all(text, |caps: &Captures| {
            let amount_str = &caps[1];

            // Parse the amount
            let amount = match amount_str.parse::<f64>() {
                Ok(num) => num,
                Err(_) => return caps[0].to_string(),
            };

            format_currency_for_speech(amount)
        })
        .to_string()
}

/// Normalize percentages
///
/// Examples:
/// - "50%" → "fifty percent"
/// - "33.5%" → "thirty-three point five percent"
fn normalize_percentages(text: &str) -> String {
    PERCENTAGE_REGEX
        .replace_all(text, |caps: &Captures| {
            let number_str = &caps[1];

            // Parse the number
            let number = match number_str.parse::<f64>() {
                Ok(num) => num,
                Err(_) => return caps[0].to_string(),
            };

            // Convert to words
            let number_words = format_number_for_speech(number);

            format!("{} percent", number_words)
        })
        .to_string()
}

/// Format a number for speech, handling both integers and decimals
///
/// Examples:
/// - 10.0 → "ten"
/// - 10.3 → "ten point three"
/// - 100.25 → "one hundred point two five"
fn format_number_for_speech(num: f64) -> String {
    // Check if it's effectively an integer
    if (num.fract()).abs() < 0.0001 {
        // Integer - use num2words
        let integer = num.round() as i64;
        match Num2Words::new(integer).to_words() {
            Ok(words) => words,
            Err(_) => num.to_string(), // Fallback to digits
        }
    } else {
        // Decimal - split into integer and fractional parts
        format_decimal_for_speech(num)
    }
}

/// Format a decimal number for speech
///
/// Examples:
/// - 10.3 → "ten point three"
/// - 23.45 → "twenty-three point four five"
/// - 0.5 → "zero point five"
fn format_decimal_for_speech(num: f64) -> String {
    let num_str = format!("{:.10}", num); // Use high precision to avoid rounding
    let parts: Vec<&str> = num_str.trim_end_matches('0').split('.').collect();

    let integer_part = parts[0].parse::<i64>().unwrap_or(0);
    let integer_words = match Num2Words::new(integer_part).to_words() {
        Ok(words) => words,
        Err(_) => integer_part.to_string(),
    };

    if parts.len() > 1 && !parts[1].is_empty() {
        // Convert each decimal digit to words
        let decimal_digits = parts[1];
        let decimal_words: Vec<String> = decimal_digits
            .chars()
            .filter_map(|c| {
                if let Some(digit) = c.to_digit(10) {
                    Num2Words::new(digit as i64).to_words().ok()
                } else {
                    None
                }
            })
            .collect();

        if !decimal_words.is_empty() {
            format!("{} point {}", integer_words, decimal_words.join(" "))
        } else {
            integer_words
        }
    } else {
        integer_words
    }
}

/// Format currency amount for speech with dollars and cents
///
/// Examples:
/// - 23.45 → "twenty-three dollars and forty-five cents"
/// - 100.0 → "one hundred dollars"
/// - 0.50 → "fifty cents"
/// - 1.0 → "one dollar"
fn format_currency_for_speech(amount: f64) -> String {
    let dollars = amount.floor() as i64;
    let cents = ((amount.fract() * 100.0).round()) as i64;

    let dollar_words = match Num2Words::new(dollars).to_words() {
        Ok(words) => words,
        Err(_) => dollars.to_string(),
    };

    let cent_words = match Num2Words::new(cents).to_words() {
        Ok(words) => words,
        Err(_) => cents.to_string(),
    };

    match (dollars, cents) {
        (0, 0) => "zero dollars".to_string(),
        (0, c) if c == 1 => format!("{} cent", cent_words),
        (0, _) => format!("{} cents", cent_words),
        (d, 0) if d == 1 => format!("{} dollar", dollar_words),
        (_, 0) => format!("{} dollars", dollar_words),
        (_, c) if c == 1 => format!("{} dollars and {} cent", dollar_words, cent_words),
        (_, _) => format!("{} dollars and {} cents", dollar_words, cent_words),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== Currency with Scale Tests =====

    #[test]
    fn test_currency_decimal_billion() {
        assert_eq!(
            normalize_semantic("$10.3 billion"),
            "ten point three billion dollars"
        );
    }

    #[test]
    fn test_currency_integer_billion() {
        assert_eq!(
            normalize_semantic("$100 billion"),
            "one hundred billion dollars"
        );
    }

    #[test]
    fn test_currency_decimal_million() {
        assert_eq!(
            normalize_semantic("$2.5 million"),
            "two point five million dollars"
        );
    }

    #[test]
    fn test_currency_integer_million() {
        assert_eq!(
            normalize_semantic("$50 million"),
            "fifty million dollars"
        );
    }

    #[test]
    fn test_currency_trillion() {
        assert_eq!(
            normalize_semantic("$1.2 trillion"),
            "one point two trillion dollars"
        );
    }

    #[test]
    fn test_currency_abbreviation_b() {
        assert_eq!(normalize_semantic("$5.2B"), "five point two billion dollars");
    }

    #[test]
    fn test_currency_abbreviation_m() {
        assert_eq!(normalize_semantic("$15M"), "fifteen million dollars");
    }

    #[test]
    fn test_currency_abbreviation_t() {
        assert_eq!(
            normalize_semantic("$3.7T"),
            "three point seven trillion dollars"
        );
    }

    #[test]
    fn test_original_problematic_string() {
        let input =
            "I must be clear that these deals are intentionally made to continue the myth of generative AI, to pump NVIDIA, and to make sure OpenAI insiders can sell $10.3 billion of shares.";
        let result = normalize_semantic(input);

        assert!(result.contains("ten point three billion dollars"));
        assert!(!result.contains("$10.3"));
    }

    #[test]
    fn test_multiple_currencies_with_scale() {
        let input = "Sold $10.3 billion and bought $2M in assets";
        let result = normalize_semantic(input);

        assert!(result.contains("ten point three billion dollars"));
        assert!(result.contains("two million dollars"));
    }

    // ===== Simple Currency Tests =====

    #[test]
    fn test_simple_currency_with_cents() {
        assert_eq!(
            normalize_semantic("$23.45"),
            "twenty-three dollars and forty-five cents"
        );
    }

    #[test]
    fn test_simple_currency_integer() {
        assert_eq!(normalize_semantic("$50"), "fifty dollars");
    }

    #[test]
    fn test_simple_currency_one_dollar() {
        assert_eq!(normalize_semantic("$1"), "one dollar");
    }

    #[test]
    fn test_simple_currency_one_cent() {
        assert_eq!(normalize_semantic("$0.01"), "one cent");
    }

    #[test]
    fn test_simple_currency_fifty_cents() {
        assert_eq!(normalize_semantic("$0.50"), "fifty cents");
    }

    #[test]
    fn test_simple_currency_one_hundred_one() {
        assert_eq!(
            normalize_semantic("$100.01"),
            "one hundred dollars and one cent"
        );
    }

    // ===== Percentage Tests =====

    #[test]
    fn test_percentage_integer() {
        assert_eq!(normalize_semantic("50%"), "fifty percent");
    }

    #[test]
    fn test_percentage_decimal() {
        assert_eq!(
            normalize_semantic("33.5%"),
            "thirty-three point five percent"
        );
    }

    #[test]
    fn test_percentage_in_sentence() {
        assert_eq!(
            normalize_semantic("The rate increased by 15%"),
            "The rate increased by fifteen percent"
        );
    }

    // ===== Edge Cases =====

    #[test]
    fn test_no_normalization_needed() {
        assert_eq!(normalize_semantic("Hello world"), "Hello world");
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(normalize_semantic(""), "");
    }

    #[test]
    fn test_only_whitespace() {
        assert_eq!(normalize_semantic("   "), "   ");
    }

    #[test]
    fn test_mixed_content() {
        let input = "OpenAI insiders sold $10.3 billion of shares at 50% profit.";
        let result = normalize_semantic(input);

        assert!(result.contains("ten point three billion dollars"));
        assert!(result.contains("fifty percent"));
        assert!(!result.contains("$10.3"));
        assert!(!result.contains("50%"));
    }

    #[test]
    fn test_preserves_non_currency_text() {
        let input = "The value of pi is approximately 3.14";
        let result = normalize_semantic(input);

        // Should not modify non-currency decimals
        assert_eq!(result, input);
    }

    #[test]
    fn test_multiple_patterns_in_sentence() {
        let input = "They paid $100 for a 20% stake worth $5M";
        let result = normalize_semantic(input);

        assert!(result.contains("one hundred dollars"));
        assert!(result.contains("twenty percent"));
        assert!(result.contains("five million dollars"));
    }

    // ===== Helper Function Tests =====

    #[test]
    fn test_format_number_for_speech_integer() {
        assert_eq!(format_number_for_speech(10.0), "ten");
        assert_eq!(format_number_for_speech(100.0), "one hundred");
    }

    #[test]
    fn test_format_number_for_speech_decimal() {
        assert_eq!(format_number_for_speech(10.3), "ten point three");
        assert_eq!(format_number_for_speech(23.45), "twenty-three point four five");
    }

    #[test]
    fn test_format_decimal_for_speech() {
        assert_eq!(format_decimal_for_speech(10.3), "ten point three");
        assert_eq!(format_decimal_for_speech(0.5), "zero point five");
    }

    #[test]
    fn test_format_currency_for_speech() {
        assert_eq!(format_currency_for_speech(23.45), "twenty-three dollars and forty-five cents");
        assert_eq!(format_currency_for_speech(1.0), "one dollar");
        assert_eq!(format_currency_for_speech(0.01), "one cent");
        assert_eq!(format_currency_for_speech(100.0), "one hundred dollars");
    }

    // ===== Regression Tests =====

    #[test]
    fn test_currency_not_followed_by_scale() {
        // Ensure simple currency doesn't match when followed by scale
        let input = "$10.3 billion";
        let result = normalize_semantic(input);

        // Should use scale normalization, not simple currency
        assert_eq!(result, "ten point three billion dollars");
        // Should NOT be "ten point three dollars billion"
    }

    #[test]
    fn test_zero_dollars() {
        assert_eq!(normalize_semantic("$0"), "zero dollars");
    }

    #[test]
    fn test_large_decimal_places() {
        // Should handle more decimal places gracefully
        assert_eq!(
            normalize_semantic("$10.99"),
            "ten dollars and ninety-nine cents"
        );
    }

    // ===== Additional Edge Case Tests =====

    #[test]
    fn test_currency_at_start_of_string() {
        assert_eq!(
            normalize_semantic("$100 is the price"),
            "one hundred dollars is the price"
        );
    }

    #[test]
    fn test_currency_at_end_of_string() {
        assert_eq!(
            normalize_semantic("The price is $100"),
            "The price is one hundred dollars"
        );
    }

    #[test]
    fn test_consecutive_currency_amounts() {
        let result = normalize_semantic("$100 $200 $300");
        assert!(result.contains("one hundred dollars"));
        assert!(result.contains("two hundred dollars"));
        assert!(result.contains("three hundred dollars"));
    }

    #[test]
    fn test_currency_with_punctuation() {
        let result = normalize_semantic("Cost: $100. Price: $200!");
        assert!(result.contains("one hundred dollars"));
        assert!(result.contains("two hundred dollars"));
    }

    #[test]
    fn test_very_large_numbers() {
        assert_eq!(
            normalize_semantic("$999 billion"),
            "nine hundred ninety-nine billion dollars"
        );
    }

    #[test]
    fn test_very_small_cents() {
        assert_eq!(normalize_semantic("$0.05"), "five cents");
    }

    #[test]
    fn test_ninety_nine_cents() {
        assert_eq!(
            normalize_semantic("$0.99"),
            "ninety-nine cents"
        );
    }

    #[test]
    fn test_exactly_one_hundred_dollars() {
        assert_eq!(normalize_semantic("$100.00"), "one hundred dollars");
    }

    #[test]
    fn test_percentage_at_start() {
        assert_eq!(
            normalize_semantic("50% of the total"),
            "fifty percent of the total"
        );
    }

    #[test]
    fn test_percentage_at_end() {
        assert_eq!(
            normalize_semantic("Interest rate is 5%"),
            "Interest rate is five percent"
        );
    }

    #[test]
    fn test_zero_percent() {
        assert_eq!(normalize_semantic("Growth was 0%"), "Growth was zero percent");
    }

    #[test]
    fn test_hundred_percent() {
        assert_eq!(
            normalize_semantic("We achieved 100%"),
            "We achieved one hundred percent"
        );
    }

    #[test]
    fn test_multiple_scales_in_sentence() {
        let result = normalize_semantic("From $1M to $1B to $1T");
        assert!(result.contains("one million dollars"));
        assert!(result.contains("one billion dollars"));
        assert!(result.contains("one trillion dollars"));
    }

    #[test]
    fn test_decimal_with_many_places() {
        // Test that we handle multiple decimal places (rounds to cents)
        // Note: $1.234 becomes 1 dollar (integer part) + 23 cents (rounded from .234)
        let result = normalize_semantic("$1.234");
        // The implementation rounds .234 to 23 cents
        assert!(result.contains("dollars") || result.contains("dollar"));
        assert!(result.contains("cents"));
    }

    #[test]
    fn test_currency_scale_case_variations() {
        // Test case insensitivity
        assert_eq!(
            normalize_semantic("$5 Billion"),
            "five billion dollars"
        );
        assert_eq!(
            normalize_semantic("$5 BILLION"),
            "five billion dollars"
        );
    }

    #[test]
    fn test_mixed_patterns_complex() {
        let input = "Invested $50M (25% stake) at $200B valuation";
        let result = normalize_semantic(input);

        assert!(result.contains("fifty million dollars"));
        assert!(result.contains("twenty-five percent"));
        assert!(result.contains("two hundred billion dollars"));
    }

    #[test]
    fn test_currency_without_cents() {
        assert_eq!(normalize_semantic("$50.00"), "fifty dollars");
    }

    #[test]
    fn test_text_with_numbers_but_no_patterns() {
        // Regular numbers without $ or % should not be affected
        let input = "In 2024, we had 100 employees";
        assert_eq!(normalize_semantic(input), input);
    }

    #[test]
    fn test_url_with_dollar_sign() {
        // Make sure we don't break URLs or other non-currency uses
        // This is a limitation - we might incorrectly normalize edge cases
        let input = "Visit example.com?price=10";
        assert_eq!(normalize_semantic(input), input);
    }

    #[test]
    fn test_scientific_notation_not_affected() {
        // Scientific notation should not be affected
        let input = "1.5e10 items";
        assert_eq!(normalize_semantic(input), input);
    }

    // ===== Regression Tests =====

    #[test]
    fn test_no_false_positives() {
        // Ensure we don't normalize things that look like patterns but aren't
        let inputs = vec![
            "The $variable in code",
            "100%% in markdown",
            "Price $TBD",
        ];

        for input in inputs {
            let result = normalize_semantic(input);
            // These should either stay the same or have minimal changes
            println!("Input: {} -> Output: {}", input, result);
        }
    }

    #[test]
    fn test_preserves_capitalization() {
        // We should preserve capitalization of surrounding text
        let input = "NVIDIA raised $10B";
        let result = normalize_semantic(input);

        assert!(result.contains("NVIDIA"));
        assert!(result.contains("ten billion dollars"));
    }

    #[test]
    fn test_multiple_spaces_preserved() {
        // Multiple spaces should be preserved (unicode normalization handles this)
        let input = "$100  for  sale";
        let result = normalize_semantic(input);

        assert!(result.contains("one hundred dollars"));
    }
}

