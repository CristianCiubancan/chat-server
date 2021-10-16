declare namespace NodeJS {
  interface ProcessEnv {
    SERVER_URL: string;
    DATABASE_URL: string;
    REDIS_URL: string;
    PORT: string;
    SESSION_SECRET: string;
    CORS_ORIGIN: string;
    EMAIL_PORT: string;
    EMAIL_HOST: string;
    EMAIL_ADDRESS: string;
    EMAIL_PASSWORD: string;
    TWILIO_ACC: string;
    TWILIO_SECRET: string;
    AWS_BUCKET_NAME: string;
    AWS_BUCKET_REGION: string;
    AWS_ACCESS_KEY: string;
    AWS_SECRET_KEY: string;
  }
}