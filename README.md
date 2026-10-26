# Siphoning PE Automation (Foundry VTT v14)

Módulo experimental para Hunter Legacy (`hunter-system`).

## Regras configuradas
- Só contabiliza com o efeito ativo chamado exatamente `SIPHONING`.
- 1 PE por 5 PA Gerados gastos.
- 1 PE por 7 pontos de dano sofrido.
- 1 PE por 14 pontos de dano causado.
- Cada gatilho tem contador separado; o excedente fica guardado.
- Ao remover/desativar SIPHONING, zera o progresso parcial; PE já ganhos não são removidos.
- PA é observado pela redução real de `system.energy.generated`, sem novo desconto.
- PE é somado em `system.details.xp.value`.

## Importante: versão inicial para teste
Os hooks de dano variam conforme a versão/customização do sistema. A automação escuta `dnd5e.damageActor` (usado pela automação Healing Blood), mas deve ser testada em uma cena de teste para confirmar que o hook entrega o dano final e identifica corretamente atacante e alvo. A redução exata de 13 PA é excluída da contagem como ativação. Se houver outra técnica que gaste exatamente 13 PA, ela também será excluída; nesse caso será necessário diferenciar essa técnica no ponto em que o sistema cobra o custo.
