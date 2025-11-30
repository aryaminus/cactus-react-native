# ScreenSafe Architecture

This diagram illustrates the architecture of the ScreenSafe application, focusing on the bridge between React Native and the C++ Runtime via Nitro Modules.

```mermaid
graph TD
    subgraph "React Native (JS/TS)"
        App[ScreenSafe App]
        style App fill:#61dafb,stroke:#333,stroke-width:2px,color:black
        
        subgraph "Cactus SDK"
            CactusLM[CactusLM (TS)]
            CactusNative[Cactus (Nitro Interface)]
        end
    end

    subgraph "JSI Bridge"
        Nitro[react-native-nitro-modules]
        style Nitro fill:#f9f,stroke:#333,stroke-width:2px,color:black
    end

    subgraph "Native (C++)"
        HybridCactus[HybridCactus (C++)]
        style HybridCactus fill:#bbf,stroke:#333,stroke-width:2px,color:black
        
        CactusFFI[cactus_ffi (C Interface)]
        LibCactus[libcactus (Shared Library)]
        Model[AI Model (GGUF)]
    end

    %% Connections
    App -->|Uses| CactusLM
    CactusLM -->|Calls| CactusNative
    CactusNative -->|JSI / Nitro| HybridCactus
    HybridCactus -->|Calls| CactusFFI
    CactusFFI -->|Links| LibCactus
    LibCactus -->|Loads| Model

    %% File Mappings
    click CactusLM "file:///Users/aryaminus/Developer/hera/cactus-react-native/src/classes/CactusLM.ts"
    click CactusNative "file:///Users/aryaminus/Developer/hera/cactus-react-native/src/native/Cactus.ts"
    click HybridCactus "file:///Users/aryaminus/Developer/hera/cactus-react-native/cpp/HybridCactus.cpp"
    click CactusFFI "file:///Users/aryaminus/Developer/hera/cactus-react-native/cpp/cactus_ffi.h"
```

## Component Description

1.  **ScreenSafe App**: The user-facing React Native application (`example/src`).
2.  **CactusLM**: The TypeScript wrapper class (`src/classes/CactusLM.ts`) that provides a high-level API for the AI model.
3.  **Cactus (Nitro Interface)**: The generated Nitro module interface (`src/native/Cactus.ts`) that exposes C++ functionality to JavaScript via JSI.
4.  **HybridCactus**: The C++ implementation (`cpp/HybridCactus.cpp`) of the Nitro specification. It handles the logic for model initialization, completion, and embedding.
5.  **cactus_ffi**: The C interface (`cpp/cactus_ffi.h`) that bridges the C++ wrapper with the underlying shared library.
6.  **libcactus**: The core shared library containing the model runtime (likely based on llama.cpp or similar).
