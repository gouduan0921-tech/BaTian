export interface UpgradeOffer {
    id: string;
    name: string;
    requiredCompletedDays: number;
    price: number;
}

const POT_BEFORE: Record<string, { id: string; name: string }> = {
    U02: { id: 'U01', name: '第二口锅' },
    U03: { id: 'U02', name: '第三口锅' },
};

/** 打烊页上的一行。已买的不出现。锅要按顺序，然后才看天数和铜钱。 */
export function upgradeOfferLine(upgrade: UpgradeOffer, owned: ReadonlySet<string>, completedDays: number, wallet: number): string {
    const previous = POT_BEFORE[upgrade.id];
    if (previous && !owned.has(previous.id)) return `${upgrade.name}  先买${previous.name}`;
    if (completedDays < upgrade.requiredCompletedDays) return `${upgrade.name}  还要 ${upgrade.requiredCompletedDays - completedDays} 天`;
    if (wallet < upgrade.price) return `${upgrade.name}  ${upgrade.price} 铜 · 铜钱不够`;
    return `${upgrade.name}  ${upgrade.price} 铜`;
}
