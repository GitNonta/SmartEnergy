/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_WS_URL: string;
    readonly VITE_API_PORT: string;
    readonly VITE_BUILD_VERSION: string;
    readonly VITE_BUILD_ISO: string;

    // OpenAI
    readonly VITE_OPENAI_API_KEY: string;
    readonly VITE_OPENAI_MODEL: string;

    // MQTT
    readonly VITE_MQTT_BROKER_HOST: string;
    readonly VITE_MQTT_BROKER_PORT: string;
    readonly VITE_MQTT_PROTOCOL: 'ws' | 'wss';
    readonly VITE_MQTT_WS_PATH: string;
    readonly VITE_MQTT_USERNAME: string;
    readonly VITE_MQTT_PASSWORD: string;
    readonly VITE_MQTT_TOPIC_DATA: string;
    readonly VITE_MQTT_TOPIC_ALERTS: string;
    readonly VITE_MQTT_TOPIC_STATUS: string;
    readonly VITE_MQTT_TOPIC_COMMANDS: string;
    readonly VITE_RECONNECT_PERIOD: string;
    readonly VITE_CONNECT_TIMEOUT: string;
    readonly VITE_AUTO_CONNECT: string;

    // App Config
    readonly VITE_SW_ENABLED: string;
    readonly VITE_HISTORY_RETENTION_HOURS: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
