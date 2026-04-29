pub fn is_channel_artist(artist: &str) -> bool {
    let a = artist.to_lowercase();
    a.ends_with("vevo") || a.ends_with(" - topic") || a.ends_with("official")
}

pub fn strip_title_noise(title: &str) -> String {
    const NOISE: &[&str] = &[
        "official video",
        "official music video",
        "official audio",
        "official lyric video",
        "official visualizer",
        "official",
        "lyric video",
        "lyrics",
        "lyric",
        "audio",
        "music video",
        "video",
        "visualizer",
        "hd",
        "hq",
        "4k",
        "720p",
        "1080p",
        "explicit",
        "explicit version",
        "clean",
        "radio edit",
        "album version",
        "single version",
    ];
    let mut s = title.trim().to_string();
    loop {
        let before = s.clone();
        for (open, close) in [('(', ')'), ('[', ']')] {
            if s.ends_with(close) {
                if let Some(pos) = s.rfind(open) {
                    let inner = s[pos + 1..s.len() - 1].trim().to_lowercase();
                    let is_noise = NOISE.contains(&inner.as_str())
                        || inner.contains("remaster")
                        || inner.contains("re-master");
                    if is_noise {
                        s = s[..pos].trim_end().to_string();
                        break;
                    }
                }
            }
        }
        if s == before {
            break;
        }
    }
    s
}

pub fn normalize_browser_track(title: &str, artist: &str) -> (String, String) {
    let clean_artist = artist
        .strip_suffix(" - Topic")
        .or_else(|| artist.strip_suffix("VEVO"))
        .or_else(|| artist.strip_suffix("Official"))
        .unwrap_or(artist)
        .trim()
        .to_string();
    let channel = is_channel_artist(artist);
    let (raw_name, final_artist) = if let Some(dash) = title.find(" - ") {
        let left = title[..dash].trim();
        let right = title[dash + 3..].trim();
        if !left.is_empty()
            && !right.is_empty()
            && (channel || left.eq_ignore_ascii_case(&clean_artist))
        {
            (right.to_string(), left.to_string())
        } else {
            (title.to_string(), clean_artist)
        }
    } else {
        (title.to_string(), clean_artist)
    };
    (strip_title_noise(&raw_name), final_artist)
}

pub fn detect_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG") {
        Some("image/png")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_youtube_music_topic_suffix_stripped() {
        let (title, artist) = normalize_browser_track("Some Song", "Artist - Topic");
        assert_eq!(title, "Some Song");
        assert_eq!(artist, "Artist");
    }

    #[test]
    fn normalize_splits_title_when_topic_channel() {
        let (title, artist) =
            normalize_browser_track("Real Artist - Song Name", "Real Artist - Topic");
        assert_eq!(title, "Song Name");
        assert_eq!(artist, "Real Artist");
    }

    #[test]
    fn normalize_vevo_suffix_stripped() {
        let (title, artist) = normalize_browser_track("Artist - Song", "ArtistVEVO");
        assert_eq!(title, "Song");
        assert_eq!(artist, "Artist");
    }

    #[test]
    fn normalize_clean_title_and_artist_unchanged() {
        let (title, artist) = normalize_browser_track("Clean Title", "Regular Artist");
        assert_eq!(title, "Clean Title");
        assert_eq!(artist, "Regular Artist");
    }

    #[test]
    fn normalize_empty_artist_returns_title_as_is() {
        let (title, artist) = normalize_browser_track("Just A Title", "");
        assert_eq!(title, "Just A Title");
        assert_eq!(artist, "");
    }

    #[test]
    fn normalize_no_dash_in_title_returns_full_title() {
        let (title, artist) = normalize_browser_track("NoDashTitle", "Artist - Topic");
        assert_eq!(title, "NoDashTitle");
        assert_eq!(artist, "Artist");
    }

    #[test]
    fn strip_noise_official_video() {
        assert_eq!(strip_title_noise("My Song (Official Video)"), "My Song");
    }

    #[test]
    fn strip_noise_lyrics_parenthetical() {
        assert_eq!(strip_title_noise("My Song (Lyrics)"), "My Song");
    }

    #[test]
    fn strip_noise_remastered_with_year() {
        assert_eq!(
            strip_title_noise("Classic Track (Remastered 2011)"),
            "Classic Track"
        );
    }

    #[test]
    fn strip_noise_official_audio() {
        assert_eq!(
            strip_title_noise("Song Title (Official Audio)"),
            "Song Title"
        );
    }

    #[test]
    fn strip_noise_clean_title_unchanged() {
        assert_eq!(strip_title_noise("Normal Title"), "Normal Title");
    }

    #[test]
    fn strip_noise_bracket_noise_removed() {
        assert_eq!(strip_title_noise("Song [Official Video]"), "Song");
    }

    #[test]
    fn detect_mime_jpeg_magic_bytes() {
        let jpeg = b"\xff\xd8\xff\xe0some jpeg data";
        assert_eq!(detect_mime(jpeg), Some("image/jpeg"));
    }

    #[test]
    fn detect_mime_png_magic_bytes() {
        let png = b"\x89PNG\r\nsome png data";
        assert_eq!(detect_mime(png), Some("image/png"));
    }

    #[test]
    fn detect_mime_unknown_bytes_returns_none() {
        let unknown = b"\x00\x01\x02\x03";
        assert_eq!(detect_mime(unknown), None);
    }

    #[test]
    fn detect_mime_empty_slice_returns_none() {
        assert_eq!(detect_mime(&[]), None);
    }
}
