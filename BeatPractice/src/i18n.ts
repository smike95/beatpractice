export type Language = 'uk' | 'en';

export const translations = {
  uk: {
    // Header & Brand
    play: 'Грати',
    pause: 'Пауза',
    reset: 'Скинути',

    // Theme
    theme: 'Тема',
    themeLight: 'Світла',
    themeDark: 'Темна',
    themeSystem: 'Як у системі',

    // Master transport & track
    decreaseTempo5: 'Зменшити темп на 5 BPM',
    decreaseTempo1: 'Зменшити темп на 1 BPM',
    increaseTempo1: 'Збільшити темп на 1 BPM',
    increaseTempo5: 'Збільшити темп на 5 BPM',
    resetOriginalTempo: 'Скинути до оригінального темпу',

    // Playlist panel
    addTrack: 'Додати аудіо',
    emptyPlaylist: 'Плейліст порожній',
    emptyPlaylistSub: 'Натисніть «Додати аудіо» або перетягніть файли сюди',
    deleteTrack: 'Видалити трек',

    // Stem separator
    processingAudio: 'Обробка аудіо...',
  },
  en: {
    // Header & Brand
    play: 'Play',
    pause: 'Pause',
    reset: 'Reset',

    // Theme
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',

    // Master transport & track
    decreaseTempo5: 'Decrease tempo by 5 BPM',
    decreaseTempo1: 'Decrease tempo by 1 BPM',
    increaseTempo1: 'Increase tempo by 1 BPM',
    increaseTempo5: 'Increase tempo by 5 BPM',
    resetOriginalTempo: 'Reset to original tempo',

    // Playlist panel
    addTrack: 'Add Audio',
    emptyPlaylist: 'Playlist is empty',
    emptyPlaylistSub: 'Press “Add Audio” or drag files here',
    deleteTrack: 'Remove track',

    // Stem separator
    processingAudio: 'Processing audio...',
  }
} as const;

export type TranslationKey = keyof typeof translations.uk;
