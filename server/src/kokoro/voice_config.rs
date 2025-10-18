// Voice configuration for Kokoro TTS v1.0
//
// This file contains the subset of voices we support in our application.
// The Kokoro-82M model supports 54 voices across 9 languages, but we currently
// only include English voices (American and British).
//
// ## Kokoro TTS Resources
// - Model: https://huggingface.co/hexgrad/Kokoro-82M
// - Complete voice list: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
// - GitHub: https://github.com/hexgrad/kokoro
//
// ## Voice Naming Convention
// Voice IDs follow the pattern: {language}{gender}_{name}
// - Language codes: a=American, b=British, e=European, f=French, h=Hindi, i=Italian, j=Japanese, p=Portuguese, z=Chinese
// - Gender codes: f=Female, m=Male
// - Examples: af_heart (American Female - Heart), bm_lewis (British Male - Lewis)
//
// ## Adding New Voices
// To add support for more voices from Kokoro:
// 1. Add the language variant to the Language enum below
// 2. Add the voice to the Voice enum (follow existing naming pattern)
// 3. Add the voice configuration in the config() method
// 4. Add the voice to the all() array
// 5. The voice will automatically be available in the /voices endpoint and generate_samples

/// Gender of the voice
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Gender {
    Female,
    Male,
}

/// Language/accent of the voice
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Language {
    AmericanEnglish,
    BritishEnglish,
}

/// Voice configuration with metadata
#[derive(Debug, Clone)]
pub struct VoiceConfig {
    pub id: &'static str,
    pub name: &'static str,
    pub gender: Gender,
    pub language: Language,
    pub description: &'static str,
}

impl VoiceConfig {
    pub const fn new(
        id: &'static str,
        name: &'static str,
        gender: Gender,
        language: Language,
        description: &'static str,
    ) -> Self {
        Self {
            id,
            name,
            gender,
            language,
            description,
        }
    }
}

/// Path to the voices binary file
#[allow(dead_code)]
pub const VOICES_FILE_PATH: &str = "models/voices-v1.0.bin";

/// Voice enum representing all available voices
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Voice {
    // American Female voices
    AmericanFemaleAlloy,
    AmericanFemaleAoede,
    AmericanFemaleBella,
    AmericanFemaleHeart,
    AmericanFemaleJessica,
    AmericanFemaleKore,
    AmericanFemaleNicole,
    AmericanFemaleNova,
    AmericanFemaleRiver,
    AmericanFemaleSarah,
    AmericanFemaleSky,

    // American Male voices
    AmericanMaleAdam,
    AmericanMaleEcho,
    AmericanMaleEric,
    AmericanMaleFenrir,
    AmericanMaleLiam,
    AmericanMaleMichael,
    AmericanMaleOnyx,
    AmericanMalePuck,
    AmericanMaleSanta,

    // British Female voices
    BritishFemaleAlice,
    BritishFemaleEmma,
    BritishFemaleIsabella,
    BritishFemaleLily,

    // British Male voices
    BritishMaleDaniel,
    BritishMaleFable,
    BritishMaleGeorge,
    BritishMaleLewis,
}

impl Voice {
    /// Get the voice configuration for this voice
    pub const fn config(&self) -> VoiceConfig {
        match self {
            // American Female voices
            Voice::AmericanFemaleAlloy => VoiceConfig::new(
                "af_alloy",
                "Alloy",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Alloy",
            ),
            Voice::AmericanFemaleAoede => VoiceConfig::new(
                "af_aoede",
                "Aoede",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Aoede",
            ),
            Voice::AmericanFemaleBella => VoiceConfig::new(
                "af_bella",
                "Bella",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Bella",
            ),
            Voice::AmericanFemaleHeart => VoiceConfig::new(
                "af_heart",
                "Heart",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Heart",
            ),
            Voice::AmericanFemaleJessica => VoiceConfig::new(
                "af_jessica",
                "Jessica",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Jessica",
            ),
            Voice::AmericanFemaleKore => VoiceConfig::new(
                "af_kore",
                "Kore",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Kore",
            ),
            Voice::AmericanFemaleNicole => VoiceConfig::new(
                "af_nicole",
                "Nicole",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Nicole",
            ),
            Voice::AmericanFemaleNova => VoiceConfig::new(
                "af_nova",
                "Nova",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Nova",
            ),
            Voice::AmericanFemaleRiver => VoiceConfig::new(
                "af_river",
                "River",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - River",
            ),
            Voice::AmericanFemaleSarah => VoiceConfig::new(
                "af_sarah",
                "Sarah",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Sarah",
            ),
            Voice::AmericanFemaleSky => VoiceConfig::new(
                "af_sky",
                "Sky",
                Gender::Female,
                Language::AmericanEnglish,
                "American female voice - Sky",
            ),

            // American Male voices
            Voice::AmericanMaleAdam => VoiceConfig::new(
                "am_adam",
                "Adam",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Adam",
            ),
            Voice::AmericanMaleEcho => VoiceConfig::new(
                "am_echo",
                "Echo",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Echo",
            ),
            Voice::AmericanMaleEric => VoiceConfig::new(
                "am_eric",
                "Eric",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Eric",
            ),
            Voice::AmericanMaleFenrir => VoiceConfig::new(
                "am_fenrir",
                "Fenrir",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Fenrir",
            ),
            Voice::AmericanMaleLiam => VoiceConfig::new(
                "am_liam",
                "Liam",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Liam",
            ),
            Voice::AmericanMaleMichael => VoiceConfig::new(
                "am_michael",
                "Michael",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Michael",
            ),
            Voice::AmericanMaleOnyx => VoiceConfig::new(
                "am_onyx",
                "Onyx",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Onyx",
            ),
            Voice::AmericanMalePuck => VoiceConfig::new(
                "am_puck",
                "Puck",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Puck",
            ),
            Voice::AmericanMaleSanta => VoiceConfig::new(
                "am_santa",
                "Santa",
                Gender::Male,
                Language::AmericanEnglish,
                "American male voice - Santa",
            ),

            // British Female voices
            Voice::BritishFemaleAlice => VoiceConfig::new(
                "bf_alice",
                "Alice",
                Gender::Female,
                Language::BritishEnglish,
                "British female voice - Alice",
            ),
            Voice::BritishFemaleEmma => VoiceConfig::new(
                "bf_emma",
                "Emma",
                Gender::Female,
                Language::BritishEnglish,
                "British female voice - Emma",
            ),
            Voice::BritishFemaleIsabella => VoiceConfig::new(
                "bf_isabella",
                "Isabella",
                Gender::Female,
                Language::BritishEnglish,
                "British female voice - Isabella",
            ),
            Voice::BritishFemaleLily => VoiceConfig::new(
                "bf_lily",
                "Lily",
                Gender::Female,
                Language::BritishEnglish,
                "British female voice - Lily",
            ),

            // British Male voices
            Voice::BritishMaleDaniel => VoiceConfig::new(
                "bm_daniel",
                "Daniel",
                Gender::Male,
                Language::BritishEnglish,
                "British male voice - Daniel",
            ),
            Voice::BritishMaleFable => VoiceConfig::new(
                "bm_fable",
                "Fable",
                Gender::Male,
                Language::BritishEnglish,
                "British male voice - Fable",
            ),
            Voice::BritishMaleGeorge => VoiceConfig::new(
                "bm_george",
                "George",
                Gender::Male,
                Language::BritishEnglish,
                "British male voice - George",
            ),
            Voice::BritishMaleLewis => VoiceConfig::new(
                "bm_lewis",
                "Lewis",
                Gender::Male,
                Language::BritishEnglish,
                "British male voice - Lewis",
            ),
        }
    }

    /// Get the voice ID string
    pub const fn id(&self) -> &'static str {
        self.config().id
    }

    /// Get all available voices as an array
    pub const fn all() -> [Voice; 28] {
        [
            Voice::AmericanFemaleAlloy,
            Voice::AmericanFemaleAoede,
            Voice::AmericanFemaleBella,
            Voice::AmericanFemaleHeart,
            Voice::AmericanFemaleJessica,
            Voice::AmericanFemaleKore,
            Voice::AmericanFemaleNicole,
            Voice::AmericanFemaleNova,
            Voice::AmericanFemaleRiver,
            Voice::AmericanFemaleSarah,
            Voice::AmericanFemaleSky,
            Voice::AmericanMaleAdam,
            Voice::AmericanMaleEcho,
            Voice::AmericanMaleEric,
            Voice::AmericanMaleFenrir,
            Voice::AmericanMaleLiam,
            Voice::AmericanMaleMichael,
            Voice::AmericanMaleOnyx,
            Voice::AmericanMalePuck,
            Voice::AmericanMaleSanta,
            Voice::BritishFemaleAlice,
            Voice::BritishFemaleEmma,
            Voice::BritishFemaleIsabella,
            Voice::BritishFemaleLily,
            Voice::BritishMaleDaniel,
            Voice::BritishMaleFable,
            Voice::BritishMaleGeorge,
            Voice::BritishMaleLewis,
        ]
    }

    /// Get voices by language
    #[allow(dead_code)]
    pub fn by_language(language: Language) -> Vec<Voice> {
        Self::all()
            .into_iter()
            .filter(|v| v.config().language == language)
            .collect()
    }

    /// Get voices by gender
    #[allow(dead_code)]
    pub fn by_gender(gender: Gender) -> Vec<Voice> {
        Self::all()
            .into_iter()
            .filter(|v| v.config().gender == gender)
            .collect()
    }

    /// Get voices by language and gender
    #[allow(dead_code)]
    pub fn by_language_and_gender(language: Language, gender: Gender) -> Vec<Voice> {
        Self::all()
            .into_iter()
            .filter(|v| {
                let config = v.config();
                config.language == language && config.gender == gender
            })
            .collect()
    }
}
