// The one translation unit that contains miniaudio's implementation (decoding + audio device output).
#define MINIAUDIO_IMPLEMENTATION
#define MA_NO_GENERATION
#define MA_NO_ENGINE
#define MA_NO_NODE_GRAPH
#define MA_NO_RESOURCE_MANAGER
#include "../third_party/miniaudio.h"
