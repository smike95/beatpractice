# BeatPractice для Android (Capacitor)

Повний застосунок: аналіз треку, розділення на партії, метроном, цикли, розгін, експорт, пакети `.beatpack`. Інтерфейс React той самий, що на комп'ютері.
Відмінність лише в «платформі» (`src/platform/index.ts`): на комп'ютері команди йдуть через Tauri, на Android через плагін Capacitor `BeatCore`,
який передає їх у C++ міст (`beat-core/src/bridge.cpp`). Назви команд, аргументи й відповіді ті самі.

```
React (src/)  ->  platform/index.ts  ->  Capacitor-плагін BeatCore (Kotlin)  ->  JNI (beat-core/android)  ->  bridge.cpp  ->  Player
```

## Що перевірено, а що ні

Перевірено на Linux тестами: C++ міст (`bridge_test`), JNI-шар з реальною JVM і перевіркою `-Xcheck:jni` (в тому числі емодзі й українські назви),
шар платформи в TypeScript (з підміною Capacitor і Tauri), весь ланцюжок з реальними моделями.
**Не перевірено** (немає NDK, SDK, емулятора): збірка під Android, весь Kotlin-код, маніфест, Gradle-фрагменти, ONNX Runtime для Android,
вирівнювання бібліотек на 16 КБ, вигляд інтерфейсу на екрані телефона (відступи під системні панелі додано через `env(safe-area-inset-*)`,
а інтерфейс спочатку був зроблений для комп'ютера: перевірте розкладку у вузькому вікні, великі кнопки, жест «назад»). Це перше, що слід зібрати й прогнати на телефоні.

## Кроки

1. У теці застосунку (BeatPractice): `npm i`, потім `npx cap init` (appId, наприклад, `app.beatpractice`), `npm run build`, `npx cap add android`.
   (`@capacitor/core` уже в `package.json`; додайте `@capacitor/cli` і `@capacitor/android` як у Word Seeker.)
2. Скопіюйте `android-plugin/kotlin/app/beatpractice/*.kt` у `android/app/src/main/java/app/beatpractice/`
   або додайте теку в `sourceSets` (див. `android-plugin/gradle/build.gradle.snippets.txt`).
3. `android-plugin/scripts/prepare-ort.sh <корінь проєкту>`: завантажує ONNX Runtime для Android (1.22.0, як на комп'ютері) і розкладає його.
4. Gradle і маніфест: фрагменти з `android-plugin/gradle/` (`build.gradle.snippets.txt`, `AndroidManifest.snippets.xml`, `file_paths.xml`
   у `res/xml/`).
5. `MainActivity`: зареєструйте плагін і передайте йому вхідні файли («Відкрити за допомогою»):

```kotlin
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(BeatCorePlugin::class.java)          // до super.onCreate
        super.onCreate(savedInstanceState)
        (bridge.getPlugin("BeatCore")?.instance as? BeatCorePlugin)?.handleIncoming(intent)
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        (bridge.getPlugin("BeatCore")?.instance as? BeatCorePlugin)?.handleIncoming(intent)
    }
}
```

6. Моделі: розмістіть три файли (`beat_this.onnx`, `mel_spectrogram.onnx`, `htdemucs_6s_fp16weights.onnx`, разом ≈ 220 МБ) на сервері з https і впишіть
   адреси та SHA-256 у `Models.kt` (`MODEL_FILES`). Застосунок завантажує їх один раз при першому запуску (банер «Завантажити моделі»).
7. `npx cap sync android`, збірка в Android Studio. Release: **AAB**, підпис як у Word Seeker.

## Пам'ять і швидкість на телефоні

* Партії в рушії зберігаються як 16-бітні семпли, модель розділення на пристроях з пам'яттю менше 8 ГБ завантажується економно (близько 1 ГБ замість кількох).
* Мережа аналізу ритму під час роботи займає близько 1 ГБ (звільняється одразу після аналізу).
* Розділення виміряно на одному ядрі комп'ютера: близько 2,2 від реального часу, тобто чотирихвилинна пісня це хвилин 9. Телефон може бути повільнішим.
  Тому розділення працює у фоновій службі з сповіщенням (`KeepAliveService`), а готові пакети `.beatpack` можна приносити з комп'ютера.
* Якщо пристрій дуже слабкий, ядро можна зібрати без аналізу: `-DBEATCORE_WITH_ANALYSIS=OFF` (тоді відкриваються лише пакети).

## Список для Google Play (станом на листопад 2026)

* **targetSdk 36 (Android 16)**: обов'язково для нових застосунків і оновлень з 31.08.2026. Перевірте жест «назад» (predictive back) і запит дозволів.
* **16 КБ сторінки пам'яті**: обов'язково для застосунків з нативним кодом (`.so`), що цілять на Android 15+. Наша бібліотека лінкується з
  `-Wl,-z,max-page-size=16384`; `libonnxruntime.so` з AAR перевірте окремо: `zipalign -c -P 16 -v 4 app-release.apk`
  (Android Studio також підсвічує неузгоджені бібліотеки в APK Analyzer). Якщо ONNX Runtime не вирівняний, оновіть його до версії, що підтримує 16 КБ.
* **Лише 64-біт** (`arm64-v8a`): так налаштовано в Gradle-фрагменті.
* **Дозволи**: немає доступу до сховища (файли вибираються системним вибирачем і копіюються у теку застосунку). `INTERNET` лише для завантаження моделей,
  `POST_NOTIFICATIONS` для сповіщення служби.
* **Фонова служба**: у Play Console треба заповнити «Foreground service permissions» для типу `dataSync` (коротке пояснення й відео: «розділення треку
  на партії триває хвилини»). Для Android 15 `dataSync` має обмеження часу (6 годин на добу), нашим завданням цього досить.
* **Форма «Безпека даних» і політика конфіденційності**: застосунок не збирає дані, файли залишаються на пристрої; мережа використовується лише для завантаження моделей.
  Якщо з'явиться ліцензування чи акаунти, форму треба буде оновити.
* **Моделі** завантажуються як дані, а не код: політика Play це дозволяє. Розмір AAB малий, бо моделей у ньому немає.
* **Авторське право**: застосунок працює з файлами користувача. Опис у Play не повинен обіцяти «скачування музики» й подібного.
* **Тестування**: щонайменше один слабкий пристрій (3–4 ГБ пам'яті) і один з Android 15+ та 16 КБ сторінками (емулятор Android 15 з 16 КБ).
