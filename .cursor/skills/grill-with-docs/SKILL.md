---
name: grill-with-docs
description: Uma entrevista implacável para afiar um plano ou design, criando também a documentação (ADRs e glossário), conduzida em português.
disable-model-invocation: true
---

Conduza toda a conversa em **português**, incluindo a documentação gerada. Só responda ou traduza o conteúdo para o inglês se o usuário pedir explicitamente.

Call the Skill tool twice, for "grilling" and "domain-modeling".

**Modo de entrevista — todas as perguntas de uma vez só**: ignore as rodadas (rounds) do grilling. Construa a árvore de decisão completa primeiro e apresente todas as perguntas em uma única mensagem, numeradas, cada uma com a sua resposta recomendada. Inclua também as perguntas que dependem da resposta de outras — o usuário responde tudo de uma vez. Só reitere se as respostas abrirem decisões novas.
