from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str  # papel romaneia_app (sem BYPASSRLS)
    jwt_secret: str = Field(min_length=32)
    jwt_expira_min: int = 480
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:5173"
    app_url: str = "http://localhost:8080"  # onde o navegador abre o app (retorno do Google)
    google_client_id: str = ""
    google_client_secret: str = ""
    # "dev": código não é enviado; vai para o log e volta na resposta (só protótipo, precisa ser ligado explicitamente).
    # Qualquer outro valor: cadastro por código fica recusado até existir envio real (fail-closed).
    verificacao_modo: str = "desativado"

    # WhatsApp Cloud API (Meta). Sem token + phone_number_id, o envio automático fica desligado (só o link manual).
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_api_url: str = "https://graph.facebook.com"
    whatsapp_api_versao: str = "v23.0"
    # Modelos aprovados na Meta. Sem modelo, envia texto livre (só funciona na janela de 24 h após o fornecedor escrever).
    whatsapp_modelo: str = ""
    whatsapp_modelo_cancelamento: str = ""
    whatsapp_modelo_idioma: str = "pt_BR"
    whatsapp_verify_token: str = ""  # handshake do webhook
    whatsapp_app_secret: str = ""    # assinatura X-Hub-Signature-256 do webhook

    @property
    def google_ativo(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
