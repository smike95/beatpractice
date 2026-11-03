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
**Не перевірено** (немає NDK, SDK, емулятора): збірка під Android, asset pack з моделями, весь Kotlin-код, маніфест, Gradle-фрагменти, ONNX Runtime для Android,
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

6. Моделі всередині застосунку: скопіюйте `android-plugin/gradle/models_pack/` у `android/models_pack/`, покладіть у
   `models_pack/src/main/assets/models/` три файли (`beat_this.onnx`, `mel_spectrogram.onnx`, `htdemucs_6s_fp16weights.onnx`, разом ≈ 220 МБ),
   додайте `include ':models_pack'` у `settings.gradle` і `assetPacks = [":models_pack"]` у `app/build.gradle`. Це «install-time asset pack»: він
   входить у той самий AAB і ставиться разом із застосунком, тож сервер і мережа не потрібні. Причина: базовий модуль AAB обмежений 200 МБ,
   а окремий asset pack може бути до 1,5 ГБ. При першому запуску застосунок один раз копіює моделі у власну теку (кілька секунд; банер показує хід).
   Якщо змінюєте файл моделі, дайте йому нову назву й оновіть `Models.kt` (там розміри файлів).
   Для запуску з Android Studio вибирайте «Deploy: APK from app bundle», інакше asset pack не потрапить на пристрій.
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
* **Дозволи**: немає доступу до сховища (файли вибираються системним вибирачем і копіюються у теку застосунку) і немає `INTERNET`: застосунок не користується мережею.
  Є лише `POST_NOTIFICATIONS` для сповіщення служби.
* **Фонова служба**: у Play Console треба заповнити «Foreground service permissions» для типу `dataSync` (коротке пояснення й відео: «розділення треку
  на партії триває хвилини»). Для Android 15 `dataSync` має обмеження часу (6 годин на добу), нашим завданням цього досить.
* **Форма «Безпека даних» і політика конфіденційності**: застосунок не збирає й не передає дані, файли залишаються на пристрої, мережі немає.
  Якщо з'явиться ліцензування чи акаунти, форму треба буде оновити.
* **Розмір**: разом із моделями завантаження буде понад 200 МБ (базовий модуль лишається малим, моделі в asset pack). Play на мобільному інтернеті покаже
  користувачеві неблокуюче попередження про великий розмір. Ліміти Play: базовий модуль 200 МБ, asset pack 1,5 ГБ, усе разом 4 ГБ.
  Моделі після першого запуску займають на пристрої місце двічі (в застосунку й у власній теці, ≈ 220 МБ зайвих); якщо це стане проблемою, їх можна віддавати як fast-follow asset pack і читати без копії.
* **Авторське право**: застосунок працює з файлами користувача. Опис у Play не повинен обіцяти «скачування музики» й подібного.
* **Тестування**: щонайменше один слабкий пристрій (3–4 ГБ пам'яті) і один з Android 15+ та 16 КБ сторінками (емулятор Android 15 з 16 КБ).
