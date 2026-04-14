/** Central registry of all localStorage keys used by Party Display. */
export const KEYS = {
  // Audio source
  audioSource:         'pd_audio_source',
  localAudioFolder:    'pd_local_audio_folder',
  localAudioRecursive: 'pd_local_audio_recursive',

  // Photo source
  photoSource:         'pd_photo_source',
  lastPhotoFolder:     'pd_last_folder',
  lastPhotoPosition:   'pd_last_photo',

  // Slideshow config
  slideshowFixedSec:   'pd_slideshow_fixed_sec',
  slideshowOrder:      'pd_order',
  slideshowSubfolders: 'pd_subfolder',

  // Display settings — toasts
  toastDurationMs:     'pd_toast_duration_ms',
  songToastZoom:       'pd_song_toast_zoom',
  volumeToastZoom:     'pd_volume_toast_zoom',

  // Display settings — transitions
  transitionEffect:    'pd_transition_effect',
  transitionDurationMs:'pd_transition_duration_ms',
  imageFit:            'pd_image_fit',

  // Visualizer
  visualizerMode:           'pd_visualizer_mode',
  visualizerSplitSide:      'pd_visualizer_split_side',
  visualizerPresetIndex:    'pd_visualizer_preset_index',
  visualizerPresetOrder:    'pd_visualizer_preset_order',
  visualizerPresetChange:   'pd_visualizer_preset_change',
  visualizerPresetTimerMin: 'pd_visualizer_preset_timer_min',

  // Battery widget
  batteryVisible:      'pd_battery_visible',
  batterySize:         'pd_battery_size',
  batteryPosition:     'pd_battery_position',

  // Track overlay
  trackOverlayVisible: 'pd_track_overlay_visible',
  trackFontSize:       'pd_track_font_size',
  trackPosition:       'pd_track_position',
  trackColor:          'pd_track_color',
  trackBgColor:        'pd_track_bg_color',
  trackBgOpacity:      'pd_track_bg_opacity',

  // Corner widgets
  photoCounterVisible: 'pd_photo_counter_visible',
  cwVisible:           'pd_cw_visible',
  cwPosition:          'pd_cw_position',
  cwTimeFormat:        'pd_cw_time_format',
  cwTempUnit:          'pd_cw_temp_unit',
  cwCity:              'pd_cw_city',

  // Lyrics
  lyricsVisible:       'pd_lyrics_visible',
  lyricsSize:          'pd_lyrics_size',
  lyricsOpacity:       'pd_lyrics_opacity',
  lyricsPosition:      'pd_lyrics_position',
  lyricsSplit:         'pd_lyrics_split',
  lyricsSplitSide:     'pd_lyrics_split_side',
} as const
