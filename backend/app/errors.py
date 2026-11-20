from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status: int, codigo: str, mensagem: str, detalhes=None):
        self.status, self.codigo, self.mensagem, self.detalhes = status, codigo, mensagem, detalhes


def nao_encontrado(entidade: str) -> AppError:
    return AppError(404, "nao_encontrado", f"{entidade} não encontrado(a)")


def _resp(status: int, codigo: str, mensagem: str, detalhes=None) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content=jsonable_encoder({"erro": {"codigo": codigo, "mensagem": mensagem, "detalhes": detalhes}}))


def registrar_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app(_: Request, e: AppError):
        return _resp(e.status, e.codigo, e.mensagem, e.detalhes)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, e: RequestValidationError):
        det = [{"campo": ".".join(str(p) for p in err["loc"][1:]), "mensagem": err["msg"]} for err in e.errors()]
        return _resp(422, "validacao", "Dados inválidos", det)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return _resp(e.status_code, "http", str(e.detail))

    @app.exception_handler(DBAPIError)
    async def _db(_: Request, e: DBAPIError):
        estado = getattr(e.orig, "sqlstate", None)
        if estado == "23505":
            return _resp(409, "duplicado", "Registro duplicado")
        if estado in ("23514", "23503", "23502", "22P02"):
            return _resp(422, "restricao", "Operação viola uma regra de integridade")
        raise e
