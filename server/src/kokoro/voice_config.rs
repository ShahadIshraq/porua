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
    European,
    French,
    Hindi,
    Italian,
    Japanese,
    Portuguese,
    Chinese,
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
pub const VOICES_FILE_PATH: &str = "models/voices-v1.0.bin";

/// Voice enum representing all available voices in Kokoro TTS v1.0
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

    // European voices
    EuropeanFemaleDora,
    EuropeanMaleAlex,
    EuropeanMaleSanta,

    // French voices
    FrenchFemaleSiwis,

    // Hindi voices
    HindiFemalealpha,
    HindiFemalebeta,
    HindiMaleOmega,
    HindiMalePsi,

    // Italian voices
    ItalianFemaleSara,
    ItalianMaleNicola,

    // Japanese voices
    JapaneseFemaleAlpha,
    JapaneseFemaleGongitsune,
    JapaneseFemaleNezumi,
    JapaneseFemaleTebukuro,
    JapaneseMaleKumo,

    // Portuguese voices
    PortugueseFemaleDora,
    PortugueseMaleAlex,
    PortugueseMaleSanta,

    // Chinese voices
    ChineseFemaleXiaobei,
    ChineseFemaleXiaoni,
    ChineseFemaleXiaoxiao,
    ChineseFemaleXiaoyi,
    ChineseMaleYunjian,
    ChineseMaleYunxi,
    ChineseMaleYunxia,
    ChineseMaleYunyang,
}

impl Voice {
    /// Get the voice configuration for this voice
    pub const fn config(&self) -> VoiceConfig {
        match self {
            // American Female voices
            Voice::AmericanFemaleAlloy => VoiceConfig::new("af_alloy", "Alloy", Gender::Female, Language::AmericanEnglish, "American female voice - Alloy"),
            Voice::AmericanFemaleAoede => VoiceConfig::new("af_aoede", "Aoede", Gender::Female, Language::AmericanEnglish, "American female voice - Aoede"),
            Voice::AmericanFemaleBella => VoiceConfig::new("af_bella", "Bella", Gender::Female, Language::AmericanEnglish, "American female voice - Bella"),
            Voice::AmericanFemaleHeart => VoiceConfig::new("af_heart", "Heart", Gender::Female, Language::AmericanEnglish, "American female voice - Heart"),
            Voice::AmericanFemaleJessica => VoiceConfig::new("af_jessica", "Jessica", Gender::Female, Language::AmericanEnglish, "American female voice - Jessica"),
            Voice::AmericanFemaleKore => VoiceConfig::new("af_kore", "Kore", Gender::Female, Language::AmericanEnglish, "American female voice - Kore"),
            Voice::AmericanFemaleNicole => VoiceConfig::new("af_nicole", "Nicole", Gender::Female, Language::AmericanEnglish, "American female voice - Nicole"),
            Voice::AmericanFemaleNova => VoiceConfig::new("af_nova", "Nova", Gender::Female, Language::AmericanEnglish, "American female voice - Nova"),
            Voice::AmericanFemaleRiver => VoiceConfig::new("af_river", "River", Gender::Female, Language::AmericanEnglish, "American female voice - River"),
            Voice::AmericanFemaleSarah => VoiceConfig::new("af_sarah", "Sarah", Gender::Female, Language::AmericanEnglish, "American female voice - Sarah"),
            Voice::AmericanFemaleSky => VoiceConfig::new("af_sky", "Sky", Gender::Female, Language::AmericanEnglish, "American female voice - Sky"),

            // American Male voices
            Voice::AmericanMaleAdam => VoiceConfig::new("am_adam", "Adam", Gender::Male, Language::AmericanEnglish, "American male voice - Adam"),
            Voice::AmericanMaleEcho => VoiceConfig::new("am_echo", "Echo", Gender::Male, Language::AmericanEnglish, "American male voice - Echo"),
            Voice::AmericanMaleEric => VoiceConfig::new("am_eric", "Eric", Gender::Male, Language::AmericanEnglish, "American male voice - Eric"),
            Voice::AmericanMaleFenrir => VoiceConfig::new("am_fenrir", "Fenrir", Gender::Male, Language::AmericanEnglish, "American male voice - Fenrir"),
            Voice::AmericanMaleLiam => VoiceConfig::new("am_liam", "Liam", Gender::Male, Language::AmericanEnglish, "American male voice - Liam"),
            Voice::AmericanMaleMichael => VoiceConfig::new("am_michael", "Michael", Gender::Male, Language::AmericanEnglish, "American male voice - Michael"),
            Voice::AmericanMaleOnyx => VoiceConfig::new("am_onyx", "Onyx", Gender::Male, Language::AmericanEnglish, "American male voice - Onyx"),
            Voice::AmericanMalePuck => VoiceConfig::new("am_puck", "Puck", Gender::Male, Language::AmericanEnglish, "American male voice - Puck"),
            Voice::AmericanMaleSanta => VoiceConfig::new("am_santa", "Santa", Gender::Male, Language::AmericanEnglish, "American male voice - Santa"),

            // British Female voices
            Voice::BritishFemaleAlice => VoiceConfig::new("bf_alice", "Alice", Gender::Female, Language::BritishEnglish, "British female voice - Alice"),
            Voice::BritishFemaleEmma => VoiceConfig::new("bf_emma", "Emma", Gender::Female, Language::BritishEnglish, "British female voice - Emma"),
            Voice::BritishFemaleIsabella => VoiceConfig::new("bf_isabella", "Isabella", Gender::Female, Language::BritishEnglish, "British female voice - Isabella"),
            Voice::BritishFemaleLily => VoiceConfig::new("bf_lily", "Lily", Gender::Female, Language::BritishEnglish, "British female voice - Lily"),

            // British Male voices
            Voice::BritishMaleDaniel => VoiceConfig::new("bm_daniel", "Daniel", Gender::Male, Language::BritishEnglish, "British male voice - Daniel"),
            Voice::BritishMaleFable => VoiceConfig::new("bm_fable", "Fable", Gender::Male, Language::BritishEnglish, "British male voice - Fable"),
            Voice::BritishMaleGeorge => VoiceConfig::new("bm_george", "George", Gender::Male, Language::BritishEnglish, "British male voice - George"),
            Voice::BritishMaleLewis => VoiceConfig::new("bm_lewis", "Lewis", Gender::Male, Language::BritishEnglish, "British male voice - Lewis"),

            // European voices
            Voice::EuropeanFemaleDora => VoiceConfig::new("ef_dora", "Dora", Gender::Female, Language::European, "European female voice - Dora"),
            Voice::EuropeanMaleAlex => VoiceConfig::new("em_alex", "Alex", Gender::Male, Language::European, "European male voice - Alex"),
            Voice::EuropeanMaleSanta => VoiceConfig::new("em_santa", "Santa", Gender::Male, Language::European, "European male voice - Santa"),

            // French voices
            Voice::FrenchFemaleSiwis => VoiceConfig::new("ff_siwis", "Siwis", Gender::Female, Language::French, "French female voice - Siwis"),

            // Hindi voices
            Voice::HindiFemalealpha => VoiceConfig::new("hf_alpha", "Alpha", Gender::Female, Language::Hindi, "Hindi female voice - Alpha"),
            Voice::HindiFemalebeta => VoiceConfig::new("hf_beta", "Beta", Gender::Female, Language::Hindi, "Hindi female voice - Beta"),
            Voice::HindiMaleOmega => VoiceConfig::new("hm_omega", "Omega", Gender::Male, Language::Hindi, "Hindi male voice - Omega"),
            Voice::HindiMalePsi => VoiceConfig::new("hm_psi", "Psi", Gender::Male, Language::Hindi, "Hindi male voice - Psi"),

            // Italian voices
            Voice::ItalianFemaleSara => VoiceConfig::new("if_sara", "Sara", Gender::Female, Language::Italian, "Italian female voice - Sara"),
            Voice::ItalianMaleNicola => VoiceConfig::new("im_nicola", "Nicola", Gender::Male, Language::Italian, "Italian male voice - Nicola"),

            // Japanese voices
            Voice::JapaneseFemaleAlpha => VoiceConfig::new("jf_alpha", "Alpha", Gender::Female, Language::Japanese, "Japanese female voice - Alpha"),
            Voice::JapaneseFemaleGongitsune => VoiceConfig::new("jf_gongitsune", "Gongitsune", Gender::Female, Language::Japanese, "Japanese female voice - Gongitsune"),
            Voice::JapaneseFemaleNezumi => VoiceConfig::new("jf_nezumi", "Nezumi", Gender::Female, Language::Japanese, "Japanese female voice - Nezumi"),
            Voice::JapaneseFemaleTebukuro => VoiceConfig::new("jf_tebukuro", "Tebukuro", Gender::Female, Language::Japanese, "Japanese female voice - Tebukuro"),
            Voice::JapaneseMaleKumo => VoiceConfig::new("jm_kumo", "Kumo", Gender::Male, Language::Japanese, "Japanese male voice - Kumo"),

            // Portuguese voices
            Voice::PortugueseFemaleDora => VoiceConfig::new("pf_dora", "Dora", Gender::Female, Language::Portuguese, "Portuguese female voice - Dora"),
            Voice::PortugueseMaleAlex => VoiceConfig::new("pm_alex", "Alex", Gender::Male, Language::Portuguese, "Portuguese male voice - Alex"),
            Voice::PortugueseMaleSanta => VoiceConfig::new("pm_santa", "Santa", Gender::Male, Language::Portuguese, "Portuguese male voice - Santa"),

            // Chinese voices
            Voice::ChineseFemaleXiaobei => VoiceConfig::new("zf_xiaobei", "Xiaobei", Gender::Female, Language::Chinese, "Chinese female voice - Xiaobei"),
            Voice::ChineseFemaleXiaoni => VoiceConfig::new("zf_xiaoni", "Xiaoni", Gender::Female, Language::Chinese, "Chinese female voice - Xiaoni"),
            Voice::ChineseFemaleXiaoxiao => VoiceConfig::new("zf_xiaoxiao", "Xiaoxiao", Gender::Female, Language::Chinese, "Chinese female voice - Xiaoxiao"),
            Voice::ChineseFemaleXiaoyi => VoiceConfig::new("zf_xiaoyi", "Xiaoyi", Gender::Female, Language::Chinese, "Chinese female voice - Xiaoyi"),
            Voice::ChineseMaleYunjian => VoiceConfig::new("zm_yunjian", "Yunjian", Gender::Male, Language::Chinese, "Chinese male voice - Yunjian"),
            Voice::ChineseMaleYunxi => VoiceConfig::new("zm_yunxi", "Yunxi", Gender::Male, Language::Chinese, "Chinese male voice - Yunxi"),
            Voice::ChineseMaleYunxia => VoiceConfig::new("zm_yunxia", "Yunxia", Gender::Male, Language::Chinese, "Chinese male voice - Yunxia"),
            Voice::ChineseMaleYunyang => VoiceConfig::new("zm_yunyang", "Yunyang", Gender::Male, Language::Chinese, "Chinese male voice - Yunyang"),
        }
    }

    /// Get the voice ID string
    pub const fn id(&self) -> &'static str {
        self.config().id
    }

    /// Get all available voices as an array
    pub const fn all() -> [Voice; 54] {
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
            Voice::EuropeanFemaleDora,
            Voice::EuropeanMaleAlex,
            Voice::EuropeanMaleSanta,
            Voice::FrenchFemaleSiwis,
            Voice::HindiFemalealpha,
            Voice::HindiFemalebeta,
            Voice::HindiMaleOmega,
            Voice::HindiMalePsi,
            Voice::ItalianFemaleSara,
            Voice::ItalianMaleNicola,
            Voice::JapaneseFemaleAlpha,
            Voice::JapaneseFemaleGongitsune,
            Voice::JapaneseFemaleNezumi,
            Voice::JapaneseFemaleTebukuro,
            Voice::JapaneseMaleKumo,
            Voice::PortugueseFemaleDora,
            Voice::PortugueseMaleAlex,
            Voice::PortugueseMaleSanta,
            Voice::ChineseFemaleXiaobei,
            Voice::ChineseFemaleXiaoni,
            Voice::ChineseFemaleXiaoxiao,
            Voice::ChineseFemaleXiaoyi,
            Voice::ChineseMaleYunjian,
            Voice::ChineseMaleYunxi,
            Voice::ChineseMaleYunxia,
            Voice::ChineseMaleYunyang,
        ]
    }

    /// Get voices by language
    pub fn by_language(language: Language) -> Vec<Voice> {
        Self::all()
            .into_iter()
            .filter(|v| v.config().language == language)
            .collect()
    }

    /// Get voices by gender
    pub fn by_gender(gender: Gender) -> Vec<Voice> {
        Self::all()
            .into_iter()
            .filter(|v| v.config().gender == gender)
            .collect()
    }

    /// Get voices by language and gender
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
