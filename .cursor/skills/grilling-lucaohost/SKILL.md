---
name: grilling-lucaohost
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases. Fork of Matthew Pocock's grilling skill from mattpocock/skills.
---

Fork of [Matthew Pocock's `grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) in [mattpocock/skills](https://github.com/mattpocock/skills).

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

One markdown file holds the whole tree. Include questions that depend on other questions in the same file. Under each of those, the first line names the question it hangs on.

Look facts up yourself before writing the file. Ask the user only for decisions. A gap you cannot look up is a **premise**: a claim specific enough that the user can mark it false. The premise is the only place that claim lives. One premise per gap. When every claim was looked up, the section is the single line `Nenhuma premissa em aberto.`

## Poles

Each question offers two **poles**:

- **Conservative** — the smallest commitment that settles the question. Extra machinery stays out. The downside is accepted on purpose.
- **Specialized** — the option that holds when the hard constraint is real. The extra cost is accepted on purpose.

A third option, the middle, appears only when a looked-up fact or an answer already in this tree forces it. That option's first line names the constraint.

A **blind spot** is a context this file did not verify that would kill an option. The recommendation picks a pole. It picks the middle only when the constraint on that option is a looked-up fact or a prior answer, and it says so. It names the premises it depends on, and the blind spot that would flip it to the other pole.

## The file

Write `grilling-YYYY-MM-DD-<slug>.md` in the directory the skill was invoked from — the workspace root of this session. Create only that file.

Write the file in the language of the conversation. The skeleton below is Portuguese; translate the headings when the conversation is in another language. Keep both `<details>` elements. They stay shut in Obsidian, Cursor, and VS Code previews. In raw source the text is visible, so the header tells the user to open the preview.

The user-visible message has three parts: the file path, the question titles, and the handoff (open the preview, write each answer including the false premises, open Pontos cegos, open Recomendação, save). Premises and options stay in the open. Blind spots live only inside their disclosure. The recommendation lives only inside its own disclosure.

For each option, give the pros and the cons as specific consequences. When a premise kills the option, name it in `Cai se`.

~~~~markdown
# <assunto> — grilling

1. Abra a **pré-visualização**. No código-fonte os pontos cegos e a recomendação aparecem.
2. Leia as **premissas**. As falsas entram na resposta.
3. Escreva a decisão em **Sua resposta**.
4. Abra **Pontos cegos**.
5. Abra **Recomendação**.
6. Salve o arquivo.

## Q1 — <título>

<corpo da pergunta>

### Premissas

- **P1.** <afirmação que não deu para verificar>
- **P2.** <afirmação que não deu para verificar>

### Opções

#### A. <polo conservador>

- **Prós:** ...
- **Contras:** ...
- **Cai se:** P1 for falsa

#### B. <polo especializado>

- **Prós:** ...
- **Contras:** ...
- **Cai se:** P2 for falsa

### Sua resposta

```text
Decisão:

Premissas falsas:

```

<details>
<summary>Pontos cegos — abra depois de responder</summary>

- **A falha se:** <contexto que este arquivo não verificou e que mata a opção>
- **B falha se:** <contexto que este arquivo não verificou e que mata a opção>

</details>

<details>
<summary>Recomendação — abra depois dos pontos cegos</summary>

**Opção:** <letra e nome do polo>

**Depende de:** P1

**Por quê:** <o que esse polo pega que o outro deixa passar>

**Vira o outro polo se:** <ponto cego ou premissa>

</details>
~~~~

The file is delivered when it sits in that directory and the message is only the path, the titles, and the handoff.

## When the answers are in

Read each **Sua resposta** and the premises it marks false.

A recommendation that depends on a premise the user marked false is void. Say that. Treat their answer as the standing decision, and say what it catches.

Where the answer and a still-standing recommendation diverge, say what the recommendation catches that their answer misses, and what their answer catches that the recommendation misses.

For each blind spot the answer neither denies nor adopts, ask once in that same message.

When an answer marks a premise false, adopts a blind spot, or opens a decision the file did not contain, write those questions together in one further file in the same directory. A struck premise or an adopted blind spot enters that file as a fact.

Then wait. The session is done when every branch has an answer, every premise is confirmed or struck, and every blind spot is denied or adopted. Act only after the user confirms a shared understanding.
