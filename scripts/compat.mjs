/** Runtime-only differences. Adventure sources use the oldest supported schema. */
export function tokenPlacement(scene, generation) {
 if (Number(generation) < 14) return {};
 const level = scene.firstLevel;
 if (!level?.id) throw new Error('В сцене Foundry 14 отсутствует уровень. Выполните диагностику сцены.');
 return {level: level.id, elevation: level.elevation?.bottom ?? 0};
}

export function compatibilityIssue(coreVersion, systemVersion) {
 const [core, build] = String(coreVersion).split('.').map(Number);
 const [system, minor, patch] = String(systemVersion).split('.').map(Number);
 if (!([13,14].includes(core)) || (core === 13 && build < 351))
  return 'Приключению требуется Foundry 13.351+ или Foundry 14.';
 if (system === 5 && (minor > 3 || (minor === 3 && patch >= 3))) return null;
 if (core === 14 && system === 6 && build >= 367) return null;
 return core === 13
  ? 'Для Foundry 13 используйте dnd5e 5.3.3. dnd5e 6 требует Foundry 14.'
  : 'Используйте dnd5e 5.3.3 или dnd5e 6 на Foundry 14.367+.';
}
