plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
    alias(libs.plugins.spotless)
}

spotless {
    kotlin {
        target("**/src/**/*.kt")
        ktlint()
            .editorConfigOverride(
                mapOf(
                    "ktlint_code_style" to "android_studio",
                )
            )
    }
}

android {
    namespace = "com.sergeylappo.booxrapiddraw"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sergeylappo.booxrapiddraw"
        minSdk = 28
        targetSdk = 34
        versionCode = 7
        versionName = "0.0.7-alpha"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        ndk {
            //abiFilters += "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
            abiFilters += setOf("armeabi-v7a", "arm64-v8a")
        }
    }

    buildFeatures {
        // Needed for BuildConfig.BRIDGE_PORT below (AGP 8 no longer generates BuildConfig by default).
        buildConfig = true
    }

    buildTypes {
        debug {
            // Installs alongside the stable release build instead of replacing it — Android
            // treats a different applicationId as a different app. Android Studio's Run
            // button always builds "debug", so from here on it installs this experimental
            // copy, leaving whatever's already on the device (under the base applicationId)
            // untouched. See /COMPANION_APP_RESEARCH.md in the parent repo.
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "Boox Rapid Draw (Dev)")
            resValue("string", "tile_label", "Rapid Draw (Dev)")
            // Its own port, so the dev and stable installs can never fight over one socket.
            // Whichever service bound first used to win silently — WebSocketServer reports a
            // failed bind through onError, which only logged — so the plugin could be talking to
            // the *other* app's build while you tested this one. See /COMPANION_APP_RESEARCH.md.
            // Set "Companion bridge port" to 8766 in the plugin when testing this build.
            buildConfigField("int", "BRIDGE_PORT", "8766")
        }
        // The definitive, daily-driver install: base applicationId, port 8765, plain "Rapid Draw".
        // Build and install it with:
        //   ./gradlew :app:assembleRelease && adb install -r app/build/outputs/apk/release/app-release.apk
        release {
            resValue("string", "tile_label", "Rapid Draw")
            buildConfigField("int", "BRIDGE_PORT", "8765")

            // Signed with the debug keystore because this is a personal sideloaded app with no
            // release keystore — and because it has to install *over* the existing debug-signed
            // install without uninstalling it first. Not suitable for public distribution as-is.
            signingConfig = signingConfigs.getByName("debug")

            // Minification stays OFF. The release variant has never been built, let alone run, and
            // this app is a minefield for it: the Onyx SDK is reflection-heavy, Java-WebSocket
            // resolves handlers reflectively, and HiddenApiBypass exists precisely to defeat static
            // analysis. Shipping an untested R8 config as the daily driver trades a working app for
            // a smaller one. Revisit with `-dontobfuscate` and real on-device testing if size ever
            // matters.
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.1"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }

        jniLibs {
            pickFirsts += "lib/*/libc++_shared.so"
        }
    }
}

dependencies {
    implementation(libs.androidx.activity.fragment)
    implementation(libs.androidx.core.ktx)

    implementation(libs.androidx.window)
    implementation(libs.bundles.onyx)
    implementation(libs.hiddenapibypass)

    // Obsidian-plugin companion bridge — embedded loopback WebSocket server.
    // See /COMPANION_APP_RESEARCH.md in the parent repo.
    implementation("org.java-websocket:Java-WebSocket:1.5.6")
}
