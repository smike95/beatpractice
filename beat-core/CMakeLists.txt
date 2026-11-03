cmake_minimum_required(VERSION 3.16)
project(beat_core CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# BEATCORE_WITH_ANALYSIS=ON (default): the full core: analyses songs and separates parts with neural networks (needs ONNX Runtime).
# BEATCORE_WITH_ANALYSIS=OFF: the small core for phones: plays and exports what a computer prepared (.beatpack files); needs no ONNX Runtime.
option(BEATCORE_WITH_ANALYSIS "Build the analysis and stem separation (needs ONNX Runtime)" ON)

# Point this at the unpacked ONNX Runtime for your platform (folder that contains include/ and lib/)
set(ORT_DIR "" CACHE PATH "ONNX Runtime root (contains include/ and lib/)")
if(BEATCORE_WITH_ANALYSIS AND NOT ORT_DIR)
  message(FATAL_ERROR "Pass -DORT_DIR=/path/to/onnxruntime (or -DBEATCORE_WITH_ANALYSIS=OFF for the small core)")
endif()

find_package(Threads REQUIRED)
if(WIN32)
  add_compile_definitions(NOMINMAX _USE_MATH_DEFINES _CRT_SECURE_NO_WARNINGS)
endif()
if(MSVC)
  add_compile_options(/utf-8 /EHsc)
endif()
add_library(beatcore STATIC src/beat_decode.cpp src/audio_file.cpp src/playback_engine.cpp
            src/miniaudio_impl.cpp src/stem_set.cpp src/player.cpp src/package.cpp src/bridge.cpp src/c_api.cpp)
set_target_properties(beatcore PROPERTIES POSITION_INDEPENDENT_CODE ON CXX_VISIBILITY_PRESET hidden)
target_include_directories(beatcore PUBLIC src third_party)
target_link_libraries(beatcore PUBLIC Threads::Threads ${CMAKE_DL_LIBS})
if(BEATCORE_WITH_ANALYSIS)
  target_sources(beatcore PRIVATE src/beat_analyzer.cpp src/stem_separator.cpp)
  target_compile_definitions(beatcore PUBLIC BEATCORE_WITH_ANALYSIS=1)
  target_include_directories(beatcore PUBLIC ${ORT_DIR}/include)
  if(NOT EXISTS "${ORT_DIR}/lib")
    message(FATAL_ERROR "ORT_DIR/lib not found: ${ORT_DIR}\nDelete the build folder and run cmake again with the correct -DORT_DIR=...")
  endif()
  unset(ORT_LIB CACHE)   # do not remember an old ONNX Runtime location between runs
  find_library(ORT_LIB onnxruntime PATHS ${ORT_DIR}/lib NO_DEFAULT_PATH REQUIRED)
  target_link_libraries(beatcore PUBLIC ${ORT_LIB})
endif()

# Packs (.beatpack): reading needs nothing extra; writing needs libFLAC (BSD licence), fetched and built here.
# On a device that only opens packs (e.g. Android) configure with -DBEATCORE_PACK_WRITER=OFF.
option(BEATCORE_PACK_WRITER "Build the code that creates .beatpack files (needs libFLAC)" ON)
if(BEATCORE_PACK_WRITER)
  include(FetchContent)
  set(BUILD_CXXLIBS OFF CACHE BOOL "" FORCE)
  set(BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
  set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
  set(BUILD_DOCS OFF CACHE BOOL "" FORCE)
  set(INSTALL_MANPAGES OFF CACHE BOOL "" FORCE)
  set(INSTALL_PKGCONFIG_MODULES OFF CACHE BOOL "" FORCE)
  set(INSTALL_CMAKE_CONFIG_MODULE OFF CACHE BOOL "" FORCE)
  set(WITH_OGG OFF CACHE BOOL "" FORCE)
  set(WITH_STACK_PROTECTOR OFF CACHE BOOL "" FORCE)
  set(BUILD_SHARED_LIBS OFF)
  FetchContent_Declare(flac URL https://github.com/xiph/flac/archive/refs/tags/1.4.3.tar.gz)
  FetchContent_MakeAvailable(flac)
  set_target_properties(FLAC PROPERTIES POSITION_INDEPENDENT_CODE ON)
  target_link_libraries(beatcore PUBLIC FLAC)
  target_compile_definitions(beatcore PUBLIC BEATCORE_PACK_WRITER=1)
endif()

# shared library loaded by the BeatPractice application: libbeatcore_c.dylib / .so / beatcore_c.dll
add_library(beatcore_c SHARED src/c_api.cpp)
target_link_libraries(beatcore_c PRIVATE beatcore)
set_target_properties(beatcore_c PROPERTIES CXX_VISIBILITY_PRESET hidden BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "@loader_path;${ORT_DIR}/lib")

# Android: the library that the app loads through JNI (the Capacitor plugin calls it). Build with the NDK, e.g. from Gradle's externalNativeBuild:
#   -DBEATCORE_BUILD_TOOLS=OFF -DORT_DIR=<folder with include/ and lib/ of onnxruntime-android>
if(ANDROID)
  add_library(beatcore_jni SHARED android/beatcore_jni.cpp)
  target_link_libraries(beatcore_jni PRIVATE beatcore log)
  # Google Play requires 16 KB page alignment for native libraries of apps that target Android 15 or newer
  target_link_options(beatcore_jni PRIVATE -Wl,-z,max-page-size=16384)
endif()

# command line tools and tests (not needed in an app build)
option(BEATCORE_BUILD_TOOLS "Build the command line tools and the tests" ON)
if(BEATCORE_BUILD_TOOLS)

if(BEATCORE_WITH_ANALYSIS)
add_executable(analyze_cli tools/analyze_cli.cpp)
target_link_libraries(analyze_cli beatcore)
set_target_properties(analyze_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
endif()

add_executable(render_cli tools/render_cli.cpp)
target_link_libraries(render_cli beatcore)
set_target_properties(render_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

enable_testing()
add_executable(engine_test tests/engine_test.cpp)
target_link_libraries(engine_test beatcore)
set_target_properties(engine_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME engine_test COMMAND engine_test)

add_executable(export_engine_test tests/export_engine_test.cpp)
target_link_libraries(export_engine_test beatcore)
set_target_properties(export_engine_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME export_engine_test COMMAND export_engine_test)

add_executable(package_test tests/package_test.cpp)
target_link_libraries(package_test beatcore)
set_target_properties(package_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME package_test COMMAND package_test)

add_executable(player_pack_test tests/player_pack_test.cpp)
target_link_libraries(player_pack_test beatcore)
set_target_properties(player_pack_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME player_pack_test COMMAND player_pack_test)

add_executable(bridge_test tests/bridge_test.cpp)
target_link_libraries(bridge_test beatcore)
set_target_properties(bridge_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME bridge_test COMMAND bridge_test)

add_executable(sounds_test tests/sounds_test.cpp)
target_link_libraries(sounds_test beatcore)
set_target_properties(sounds_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME sounds_test COMMAND sounds_test)

add_executable(stems_engine_test tests/stems_engine_test.cpp)
target_link_libraries(stems_engine_test beatcore)
set_target_properties(stems_engine_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME stems_engine_test COMMAND stems_engine_test)

# end-to-end stem separation through the C API (needs a model folder containing a stem model, htdemucs*.onnx; see the file header)
if(BEATCORE_WITH_ANALYSIS)
add_executable(stems_player_test tests/stems_player_test.cpp)
target_link_libraries(stems_player_test beatcore_c)
set_target_properties(stems_player_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
endif()

# interactive terminal player (to test sound output without the application)
if(BEATCORE_WITH_ANALYSIS)
add_executable(play_cli tools/play_cli.cpp)
target_link_libraries(play_cli beatcore)
set_target_properties(play_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
endif()

# integration test with a fake sound device
if(BEATCORE_WITH_ANALYSIS)
add_executable(player_test tests/player_test.cpp)
target_link_libraries(player_test beatcore)
set_target_properties(player_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
endif()

# splits a song into parts (needs a Demucs ONNX model); also prints what a model looks like (--probe)
if(BEATCORE_WITH_ANALYSIS)
add_executable(stems_cli tools/stems_cli.cpp)
target_link_libraries(stems_cli beatcore)
set_target_properties(stems_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
endif()

if(BEATCORE_WITH_ANALYSIS)
add_executable(stems_test tests/stems_test.cpp)
target_link_libraries(stems_test beatcore)
set_target_properties(stems_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
endif()

# bar structure and tempo recognition on saved network output
add_executable(meter_test tests/meter_test.cpp)
target_link_libraries(meter_test beatcore)
set_target_properties(meter_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME meter_test COMMAND meter_test ${CMAKE_SOURCE_DIR}/tests/data/meter)

endif()
