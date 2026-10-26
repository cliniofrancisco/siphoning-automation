const MODULE_ID = "siphoning-automation";
const EFFECT_NAME = "SIPHONING";
const COUNTERS = {
  pa: "pa",
  taken: "damageTaken",
  dealt: "damageDealt"
};
const THRESHOLDS = { pa: 5, damageTaken: 7, damageDealt: 14 };

function hasSiphoning(actor) {
  return !!actor?.effects?.some(e => e.name?.trim() === EFFECT_NAME && !e.disabled && !e.isSuppressed);
}
function isCharacter(actor) {
  return actor?.type === "character";
}
function getCounters(actor) {
  return foundry.utils.deepClone(actor.getFlag(MODULE_ID, "counters") ?? {
    pa: 0, damageTaken: 0, damageDealt: 0
  });
}
async function resetCounters(actor) {
  if (actor) await actor.setFlag(MODULE_ID, "counters", { pa: 0, damageTaken: 0, damageDealt: 0 });
}
async function awardPE(actor, source, amount) {
  if (!isCharacter(actor) || !hasSiphoning(actor) || !Number.isFinite(amount) || amount <= 0) return;
  const counters = getCounters(actor);
  const threshold = THRESHOLDS[source];
  if (!threshold) return;
  counters[source] = Math.max(0, Number(counters[source] ?? 0)) + Math.floor(amount);
  const gained = Math.floor(counters[source] / threshold);
  counters[source] %= threshold;
  await actor.setFlag(MODULE_ID, "counters", counters);
  if (gained <= 0) return;

  // Hunter Legacy usa o campo padrão de experiência da ficha: system.details.xp.value.
  const currentXP = Number(actor.system?.details?.xp?.value ?? 0);
  await actor.update({ "system.details.xp.value": currentXP + gained });
  ui.notifications.info(`${actor.name} recebeu ${gained} PE por SIPHONING (${source === "pa" ? "PA gastos" : source === "damageTaken" ? "dano sofrido" : "dano causado"}).`);
}
function flatValue(changes, path) {
  if (Object.prototype.hasOwnProperty.call(changes ?? {}, path)) return Number(changes[path]);
  return undefined;
}
function getActorFromDamageArgs(args) {
  // Compatibilidade com a assinatura usada por versões/customizações do sistema.
  for (const arg of args) {
    if (arg?.documentName === "Actor" || (arg?.system && arg?.effects && arg?.items)) return arg;
    if (arg?.actor?.system && arg.actor.effects) return arg.actor;
    if (arg?.token?.actor) return arg.token.actor;
  }
  return null;
}
function getDamageAmount(args) {
  // Procura um valor explícito de dano final nos argumentos do hook.
  const keys = ["damage", "appliedDamage", "totalDamage", "damageTaken", "value"];
  for (const arg of args) {
    if (typeof arg === "number" && Number.isFinite(arg) && arg > 0) return Math.floor(arg);
    if (arg && typeof arg === "object") {
      for (const key of keys) {
        const n = Number(arg[key]);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
      }
      const hp = arg.hpDamage ?? arg.damageDetail?.total;
      if (Number.isFinite(Number(hp)) && Number(hp) > 0) return Math.floor(Number(hp));
    }
  }
  return 0;
}

Hooks.once("ready", () => {
  if (game.system.id !== "hunter-system") {
    console.warn(`${MODULE_ID}: recomendado apenas para o sistema Hunter Legacy (hunter-system).`);
  }
  console.log(`${MODULE_ID} | Siphoning PE Automation v0.1.0 carregado.`);

  // Detecta gastos de PA Gerado observando a redução real de system.energy.generated.
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (!game.user.isGM && userId !== game.user.id) return;
    if (!isCharacter(actor) || !hasSiphoning(actor)) return;
    const next = flatValue(changes, "system.energy.generated");
    if (next === undefined) return;
    const old = Number(actor.system?.energy?.generated ?? 0);
    const spent = old - next;
    if (spent <= 0) return;
    // A ativação especial de 13 PA não entra na conversão.
    // Opções explícitas também permitem excluir um gasto sinalizado pelo sistema.
    if (spent === 13 || options?.siphoningIgnorePA === true || options?.isSiphoningActivation === true) return;
    // Não grava contador dentro do preUpdate; usa microtask após a atualização ser aplicada.
    queueMicrotask(() => awardPE(actor, "pa", spent).catch(err => console.error(`${MODULE_ID}: erro ao contar PA`, err)));
  });

  // Quando o efeito SIPHONING sai, perde todo o progresso parcial dos três gatilhos.
  Hooks.on("deleteActiveEffect", async effect => {
    const actor = effect?.parent;
    if (!actor || effect.name?.trim() !== EFFECT_NAME) return;
    await resetCounters(actor);
    console.log(`${MODULE_ID}: contadores de SIPHONING zerados para ${actor.name}.`);
  });

  // Integração com o hook de dano utilizado pelo módulo Healing Blood.
  Hooks.on("dnd5e.damageActor", async (...args) => {
    const target = getActorFromDamageArgs(args);
    const damage = getDamageAmount(args);
    if (target && damage > 0) await awardPE(target, "damageTaken", damage).catch(err => console.error(err));

    // O atacante pode vir indicado na mensagem de chat ou no objeto do evento.
    let attacker = null;
    for (const arg of args) {
      attacker ??= arg?.attacker?.actor ?? arg?.sourceActor ?? arg?.originActor ?? arg?.item?.actor ?? null;
      if (!attacker && arg?.speaker?.actor) attacker = game.actors.get(arg.speaker.actor);
    }
    if (attacker && damage > 0 && attacker.id !== target?.id) {
      await awardPE(attacker, "damageDealt", damage).catch(err => console.error(err));
    }
  });

  // Limpa contadores se o efeito for desativado em vez de apagado.
  Hooks.on("updateActiveEffect", async (effect, changes) => {
    const actor = effect?.parent;
    if (!actor || effect.name?.trim() !== EFFECT_NAME) return;
    if (changes.disabled === true || changes["disabled"] === true) await resetCounters(actor);
  });
});
