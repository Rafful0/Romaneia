"""Seed de DEMONSTRAÇÃO (dados fictícios). Roda com o dono do esquema; idempotente.

Uso: python -m app.seed   (requer MIGRATION_DATABASE_URL; senha via SEED_PASSWORD, padrão em .env.example)
"""
import os

from sqlalchemy import create_engine, text

from app.security import hash_senha

EMPRESA = "Distribuidora Demonstração (dados fictícios)"
USUARIOS = [("Ana Admin (demo)", "admin@demo.test", "admin"), ("Otávio Operador (demo)", "operador@demo.test", "operador")]
CLIENTES = ["Mercadinho Exemplo", "Padaria Fictícia", "Restaurante Teste"]
PRODUTOS = [("ARR5", "Arroz tipo 1 5kg", "fd", ["arroz"]), ("FEI1", "Feijão carioca 1kg", "kg", ["feijao", "feijão"]),
            ("OLE9", "Óleo de soja 900ml", "cx", ["oleo"]), ("TOM", "Tomate", "kg", []), ("OVO", "Ovos", "dz", [])]


def main() -> None:
    senha = os.environ.get("SEED_PASSWORD", "demo1234")
    eng = create_engine(os.environ["MIGRATION_DATABASE_URL"])
    with eng.begin() as c:
        if c.execute(text("select 1 from usuarios where email = :e"), {"e": USUARIOS[0][1]}).first():
            print("seed: já aplicado, nada a fazer")
            return
        emp = c.execute(text("insert into empresas (nome) values (:n) returning id"), {"n": EMPRESA}).scalar()
        for nome, email, papel in USUARIOS:
            c.execute(text("insert into usuarios (empresa_id, nome, email, senha_hash, papel) values (:e,:n,:m,:h,:p)"),
                      {"e": emp, "n": nome, "m": email, "h": hash_senha(senha), "p": papel})
        for nome in CLIENTES:
            c.execute(text("insert into clientes (empresa_id, nome) values (:e, :n)"), {"e": emp, "n": nome})
        for cod, nome, un, apelidos in PRODUTOS:
            pid = c.execute(text("insert into produtos (empresa_id, codigo, nome, unidade) values (:e,:c,:n,:u) "
                                 "returning id"), {"e": emp, "c": cod, "n": nome, "u": un}).scalar()
            for a in apelidos:
                c.execute(text("insert into produto_apelidos (empresa_id, produto_id, apelido) values (:e,:p,:a)"),
                          {"e": emp, "p": pid, "a": a})
    print(f"seed: empresa '{EMPRESA}' criada com {len(USUARIOS)} usuários de teste")


if __name__ == "__main__":
    main()
