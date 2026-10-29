cmake_minimum_required(VERSION 3.16)
project(beat_core CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Point this at the unpacked ONNX Runtime for your platform (folder that contains include/ and lib/)
set(ORT_DIR "" CACHE PATH "ONNX Runtime root (contains include/ and lib/)")
if(NOT ORT_DIR)
  message(FATAL_ERROR "Pass -DORT_DIR=/path/to/onnxruntime")
endif()

find_package(Threads REQUIRED)
if(WIN32)
  add_compile_definitions(NOMINMAX _USE_MATH_DEFINES _CRT_SECURE_NO_WARNINGS)
endif()
if(MSVC)
  add_compile_options(/utf-8 /EHsc)
endif()
add_library(beatcore STATIC src/beat_analyzer.cpp src/beat_decode.cpp src/audio_file.cpp src/playback_engine.cpp
            src/miniaudio_impl.cpp src/stem_separator.cpp src/player.cpp src/c_api.cpp)
set_target_properties(beatcore PROPERTIES POSITION_INDEPENDENT_CODE ON CXX_VISIBILITY_PRESET hidden)
target_include_directories(beatcore PUBLIC src third_party ${ORT_DIR}/include)
if(NOT EXISTS "${ORT_DIR}/lib")
  message(FATAL_ERROR "ORT_DIR/lib not found: ${ORT_DIR}\nDelete the build folder and run cmake again with the correct -DORT_DIR=...")
endif()
unset(ORT_LIB CACHE)   # do not remember an old ONNX Runtime location between runs
find_library(ORT_LIB onnxruntime PATHS ${ORT_DIR}/lib NO_DEFAULT_PATH REQUIRED)
target_link_libraries(beatcore PUBLIC ${ORT_LIB} Threads::Threads ${CMAKE_DL_LIBS})

add_executable(analyze_cli tools/analyze_cli.cpp)
target_link_libraries(analyze_cli beatcore)
set_target_properties(analyze_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

add_executable(render_cli tools/render_cli.cpp)
target_link_libraries(render_cli beatcore)
set_target_properties(render_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

enable_testing()
add_executable(engine_test tests/engine_test.cpp)
target_link_libraries(engine_test beatcore)
set_target_properties(engine_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME engine_test COMMAND engine_test)

add_executable(sounds_test tests/sounds_test.cpp)
target_link_libraries(sounds_test beatcore)
set_target_properties(sounds_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME sounds_test COMMAND sounds_test)

add_executable(stems_engine_test tests/stems_engine_test.cpp)
target_link_libraries(stems_engine_test beatcore)
set_target_properties(stems_engine_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME stems_engine_test COMMAND stems_engine_test)

# end-to-end stem separation through the C API (needs a model folder containing htdemucs.onnx; see the file header)
add_executable(stems_player_test tests/stems_player_test.cpp)
target_link_libraries(stems_player_test beatcore_c)
set_target_properties(stems_player_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

# interactive terminal player (to test sound output without Flutter)
add_executable(play_cli tools/play_cli.cpp)
target_link_libraries(play_cli beatcore)
set_target_properties(play_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

# integration test with a fake sound device
add_executable(player_test tests/player_test.cpp)
target_link_libraries(player_test beatcore)
set_target_properties(player_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

# shared library for Flutter (dart:ffi): libbeatcore_c.dylib / .so / .dll
add_library(beatcore_c SHARED src/c_api.cpp)
target_link_libraries(beatcore_c PRIVATE beatcore)
set_target_properties(beatcore_c PROPERTIES CXX_VISIBILITY_PRESET hidden BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "@loader_path;${ORT_DIR}/lib")

# splits a song into parts (needs a Demucs ONNX model); also prints what a model looks like (--probe)
add_executable(stems_cli tools/stems_cli.cpp)
target_link_libraries(stems_cli beatcore)
set_target_properties(stems_cli PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

add_executable(stems_test tests/stems_test.cpp)
target_link_libraries(stems_test beatcore)
set_target_properties(stems_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")

# bar structure and tempo recognition on saved network output
add_executable(meter_test tests/meter_test.cpp)
target_link_libraries(meter_test beatcore)
set_target_properties(meter_test PROPERTIES BUILD_RPATH "${ORT_DIR}/lib" INSTALL_RPATH "${ORT_DIR}/lib")
add_test(NAME meter_test COMMAND meter_test ${CMAKE_SOURCE_DIR}/tests/data/meter)
