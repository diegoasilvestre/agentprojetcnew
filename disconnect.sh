#!/bin/bash
# ════════════════════════════════════════════════════════
#  disconnect.sh — Remove sessão(ões) do WhatsApp
#
#  ONDE RODAR: terminal na pasta raiz do projeto
#
#  USO:
#    bash disconnect.sh              → remove TODAS as sessões
#    bash disconnect.sh LOJA_ID      → remove sessão de uma loja
#
#  No Railway: use o painel → Conexão WhatsApp → Desconectar
#  (chama POST /wa/disconnect/:lojaId que faz o mesmo)
# ════════════════════════════════════════════════════════

LOJA_ID=$1
AUTH_DIR="./auth"

if [ -n "$LOJA_ID" ]; then
  TARGET="$AUTH_DIR/session_$LOJA_ID"
  if [ -d "$TARGET" ]; then
    rm -rf "$TARGET"
    echo "✅ Sessão removida: $TARGET"
  else
    echo "ℹ️  Sessão não encontrada: $TARGET"
  fi
else
  if [ -d "$AUTH_DIR" ]; then
    rm -rf "$AUTH_DIR"
    echo "✅ Todas as sessões removidas ($AUTH_DIR)"
  else
    echo "ℹ️  Pasta auth/ não encontrada (já estava limpa)"
  fi
fi

echo ""
echo "Próximos passos:"
echo "  npm run dev → painel → Conexão WhatsApp → Gerar código"
