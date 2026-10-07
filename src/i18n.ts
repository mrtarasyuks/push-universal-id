// All user-facing text lives here, in four languages. `msg()` always returns
// the dictionary for the language currently in effect; nothing else in the app
// hardcodes copy, so switching language re-renders instantly with no reload.

export type Lang = 'en' | 'fr' | 'es' | 'uk';
export const LANGS: Lang[] = ['en', 'fr', 'es', 'uk'];
export const LANG_CODE: Record<Lang, string> = { en: 'EN', fr: 'FR', es: 'ES', uk: 'UA' };

interface Forms {
  one: string;
  few?: string;
  many: string;
}

const en = {
  docTitle: 'Push Universal ID — who are you on Push Chain?',
  docDescription:
    "Paste any address from any chain — see its Universal Executor Account (UEA) on Push Chain Donut: status, balance, gas, history and apps. Read-only, no wallet connect.",
  logo: '⚡ Push Universal ID',
  heroTitle: 'Who are you on Push Chain?',
  heroLedeHtml:
    "Paste an address from any chain (Ethereum, Base, Arbitrum, BNB, Solana) and see its <strong>Universal Executor Account</strong> on Push Chain: whether it's deployed, its balance, gas, transaction history and the apps it has interacted with. Nothing to sign, no wallet to connect — everything is read from the Donut testnet's public RPC and explorer.",
  langSwitcherLabel: 'Language',

  network: {
    aria: 'Origin chain',
    reverseOption: '↩︎ This is a UEA on Push Chain (find origin)',
  },
  address: {
    placeholderForward: '0x… or a Solana address',
    placeholderReverse: 'UEA address on Push Chain (0x…)',
    aria: 'Address',
  },
  search: { aria: 'Check' },

  errors: {
    emptyAddress: 'Enter an address.',
    invalidReverseAddress: 'For a reverse lookup, enter a valid EVM UEA address on Push Chain (0x…).',
    chooseChain: 'Choose an origin chain.',
    deriveUea: (m: string) => `Could not compute the UEA: ${m} Check that the address is valid for the chosen chain.`,
    reverseLookupFailed: (m: string) => `Reverse lookup failed: ${m}`,
  },

  chain: { nativeLabel: 'Push Chain (already here)', unknown: 'another chain' },
  token: { generic: 'token' },

  loading: { steps: ['Looking up the account', 'Counting activity', 'Preparing the result'] as [string, string, string] },

  copy: {
    generic: 'Copy',
    copyOriginAddress: 'Copy the origin address',
    copyUeaAddress: 'Copy the UEA address',
    shareLinkLabel: '🔗 Link',
    shareLinkTitle: 'Copy a link to this result',
    copiedLink: '✓ Copied',
  },

  badge: { deployed: 'UEA deployed', pending: 'UEA not deployed yet' },

  mapping: {
    originLabel: (label: string) => `Origin (${label})`,
    originFoundLabel: 'Origin (found from the UEA)',
    arrowForward: '→ UEA →',
    arrowReverse: '← UEA ←',
    unknown: 'unknown',
    noOriginShort: 'the factory has no origin for this UEA',
    ueaLabel: 'Universal Executor Account · Push Chain Donut',
    noOriginNote:
      'The Push factory does not know this address as a UEA. It is either a plain wallet on Push Chain, or a UEA not deployed yet. The activity below is for the address you entered.',
  },

  verify: {
    ok: '✓ The UEA address was confirmed <strong>by the Push factory itself</strong> (<code>computeUEA</code>, read-only) — not just computed offchain.',
    pending: "Verifying the address on the Push factory on-chain…",
    mismatch:
      '⚠ The offchain computation (CREATE2) did not match the factory’s <code>computeUEA</code>. Showing the offchain result — double check it on the explorer.',
    unavailable: 'The factory is unavailable for on-chain verification right now — the address was computed offchain (CREATE2, identical to the SDK).',
  },

  hints: {
    lazyDeploy:
      "The account deploys “lazily” — on the owner wallet's first Universal transaction. The address is already deterministically reserved (CREATE2), so it will not change.",
    gasPaid: (amount: string, n: number) => `Gas paid by the UEA's own transactions: ${amount} PC (over ${n} outgoing tx).`,
  },

  metrics: {
    balance: 'UEA balance',
    txTotal: 'Transactions total',
    tokenTransfers: 'Token transfers',
    apps: 'Apps',
    appsCounting: 'Apps (counting…)',
    rank: 'Rank',
  },

  rank: {
    rulesSummary: 'How is the rank calculated?',
    rules: [
      '🔘 Not on the radar yet — UEA not deployed and no activity at all',
      '🟢 Explorer — UEA is deployed, there is some activity, but still little',
      '🔵 Builder — 5+ transactions and 2+ apps, no cross-chain actions',
      '🟣 Universal Native — at least one cross-chain action through the Push gateway',
    ],
    footnote: (counting: boolean) =>
      `Calculated only from this UEA's real metrics, loaded above.${counting ? ' (still counting — the rank may rise)' : ''}`,
    nextLevelPrefix: 'Next level: ',
    maxLevel: 'This is the highest level in this version of the tool.',
    labels: { none: 'Not on the radar yet', explorer: 'Explorer', builder: 'Builder', native: 'Universal Native' },
    noneReason: 'The UEA is not deployed yet and has no activity at all on Push Chain.',
    noneNext: 'Make your first Universal transaction from the origin wallet — the UEA will deploy automatically.',
    nativeReason: (n: number) =>
      `Made ${n} cross-chain ${n === 1 ? 'action' : 'actions'} through the Push gateway — that is the whole point of “Universal” on this chain.`,
    builderReason: (tx: number, apps: number) =>
      `${tx} ${tx === 1 ? 'transaction' : 'transactions'} and ${apps} ${apps === 1 ? 'app' : 'apps'} on Push Chain, but no cross-chain actions yet.`,
    builderNext: 'Make a cross-chain transfer or call through the Push gateway to become Universal Native.',
    explorerReason: (tx: number) => `The UEA is deployed and has ${tx} ${tx === 1 ? 'transaction' : 'transactions'}, but still few apps.`,
    explorerNext: 'Try a few more apps on Push Chain to become a Builder.',
  },

  actions: {
    title: 'Universal actions',
    hint:
      'Decoded from <code>executeUniversalTx</code> — the real target app of each action, not the relayer. Cross-chain actions through the gateway show the chain, the method and arguments of the call on the destination, delivery status and a direct link to the destination chain’s explorer (“end of bridge”). Delivery is <strong>confirmed on the destination chain itself</strong> (via its Blockscout API): an event <code>UniversalTxExecuted/Finalized</code> with the same <code>subTxId</code> = ✓ delivered, with bridge time.',
    checking: 'Checking delivery on the destination chains…',
    targetNotDecoded: 'target not decoded',
    multicallLabel: 'multicall',
    universalTxLabel: 'universal tx',
    targetTitle: (addr: string) => `Target: ${addr}`,
    xcCallLabel: 'cross-chain call',
    xcTransferLabel: 'cross-chain transfer',
    xcChainTitleExact: 'exact destination chain from the gateway’s UniversalTxOutbound event',
    xcChainTitleGuess: 'chain inferred from the bridged token (no gateway event found)',
    spenderWord: 'spender',
    recipientWord: 'recipient',
    xcCallDetailArgsTitle: "Decoded from the gateway event's payload — the method's arguments on the destination contract",
    xcCallDetailBatchTitle: 'Inner calls of the batch (multicall), decoded from the gateway event’s payload via the SDK’s address book',
  },

  status: {
    sent: { text: '↗ sent (Push)', title: 'Sent from the Push gateway. Delivery on the destination’s Blockscout is not confirmed yet (still in flight, or that chain has no CORS-friendly Blockscout). You can check manually via the link.' },
    delivered: {
      text: (chain: string, bridge: string) => `✓ delivered to ${chain}${bridge}`,
      title: (chain: string, bridge: string) =>
        `Confirmed from ${chain}’s own Blockscout: its UniversalGateway/Vault emitted UniversalTxExecuted/Finalized with the same subTxId.${bridge ? ` Bridge time — from the Push-side call to the destination delivery event — ${bridge.replace(/^ · bridge /, '')}.` : ''}`,
    },
    failDest: {
      text: (chain: string) => `✗ rejected on ${chain}`,
      title: (chain: string) => `Confirmed from ${chain}’s Blockscout: the destination emitted UniversalTxReverted/FundsRescued with the same subTxId — delivery did not happen.`,
    },
    failPush: { text: '✗ not executed (Push)', title: 'executeUniversalTx reverted on Push — the cross-chain action was never sent.' },
    rescued: { text: '↩ returned (rescue)', title: 'The Push gateway emitted RescueFundsOnSourceChain for this exact universalTxId (sha256 of this action’s tx hash) and this token/chain: funds returned to Push, delivery did not complete.' },
  },

  bridge: {
    time: (d: string) => ` · bridge ${d}`,
    endTx: (chain: string) => `end of bridge: ${chain} tx ↗`,
    endAddr: (chain: string) => `end of bridge: ${chain} ↗`,
    txTitle: (chain: string) => `Delivery transaction on ${chain}`,
    addrTitle: (chain: string) => `Open the recipient on ${chain} — end of bridge`,
    gatewayTitle: (chain: string, guessTitle: string, recipient: string | null) =>
      `Gateway → ${chain} — ${guessTitle}${recipient ? ` · recipient ${recipient}` : ''}`,
  },

  apps: {
    title: 'UEA’s top apps',
    hint: 'Grouped by app: how many actions and how much PC went to each. Cross-chain actions are grouped by exact destination chain (from the gateway’s UniversalTxOutbound event).',
    xcBadge: 'cross-chain',
    contractTag: 'contract',
    bridgePrefix: 'bridged:',
    rescuedNote: (n: number) => `↩ ${n} ${n === 1 ? 'return' : 'returns'}`,
    rescuedTitle: 'For this direction the gateway returned funds to Push (RescueFundsOnSourceChain) — delivery did not complete. Matched by direction.',
  },

  relayers: {
    summary: (n: number) => `Transactions were submitted by Push relayers (${n}) — network infrastructure that pays gas for the UEA. Show addresses`,
  },

  holdings: {
    title: 'Tokens held by the UEA',
    hint: 'What the UEA holds on Push Chain right now (current balances from Blockscout). Bridged assets are tagged with the external chain they represent.',
    nftTag: 'NFT',
    nftUnit: 'pcs',
    tokenFallback: 'token',
  },

  tokens: {
    title: 'Tokens that passed through the UEA',
    summary: (n: number) => `${n} ${n === 1 ? 'unique token' : 'unique tokens'} · showing up to 30 of the loaded transfers.`,
  },

  tx: {
    title: 'UEA transactions',
    emptyTitle: 'No activity on Donut yet',
    emptyBody:
      'Blockscout sees no transactions for this UEA. For an external wallet that is normal: the UEA will appear on its first Universal transaction. The address is already computed and reserved.',
  },

  pagination: {
    loadedText: (tx: number, tt: number) => `${tx} ${tx === 1 ? 'transaction' : 'transactions'} and ${tt} ${tt === 1 ? 'token transfer' : 'token transfers'}`,
    autoLoading: (page: number, loaded: string) => `Loading the rest of the history in the background… page ${page}, ${loaded} so far. Gas and top apps update live.`,
    loadingBtn: 'Loading…',
    stopBtn: 'Stop',
    cappedNote: (pages: number) => ` (auto-load limit — ${pages} pages)`,
    hasMoreText: (loaded: string, cappedNote: string) => `Showing the first ${loaded}${cappedNote}. There is more — load it?`,
    loadMoreBtn: 'Load one more page',
    loadAllBtn: 'Load everything left',
    doneAllText: (loaded: string) => `Counted over the full history: ${loaded} (everything the explorer has).`,
  },

  warnings: { title: 'Some data is unavailable', balance: 'Balance', counters: 'Counters', transactions: 'Transactions', tokenTransfers: 'Token transfers', tokenBalances: 'Token balances' },

  source: {
    footerLine: (explorer: string) =>
      `Origin↔UEA — the Push factory (${explorer}) and offchain CREATE2 (@pushchain/core) · activity and decoding from Blockscout · cross-chain direction, method and status — UniversalTxOutbound / RescueFundsOnSourceChain events via eth_getLogs · `,
  },

  footerHtml: (sdkHref: string, blockscoutHref: string) =>
    `Read-only tool on public Push Chain data (Donut testnet, chain id 42101). The UEA is computed via the official <a href="${sdkHref}" target="_blank" rel="noopener">@pushchain/core</a>, activity — via the <a href="${blockscoutHref}" target="_blank" rel="noopener">Blockscout API</a>. Built by one person with AI assistance. Code: <a id="repo-link" href="#" target="_blank" rel="noopener">GitHub</a>.`,

  errBlockscoutUnreachable: (detail: string) => `Could not reach Blockscout (${detail}). The network might be down or CORS is blocked.`,
  errBlockscoutStatus: (status: number) => `Blockscout responded ${status}`,
  errRpcUnreachable: (detail: string) => `Could not reach the Push Chain RPC (${detail}).`,
  errRpcStatus: (status: number) => `RPC responded ${status}`,
  errEthCallGeneric: 'eth_call error',
  errEthCallEmpty: 'Empty eth_call response',
  errInvalidSolanaAddress: 'Invalid Solana address (expected 32 bytes).',

  words: {
    tx: { one: 'transaction', many: 'transactions' } as Forms,
    tokenTransfer: { one: 'token transfer', many: 'token transfers' } as Forms,
    app: { one: 'app', many: 'apps' } as Forms,
    action: { one: 'action', many: 'actions' } as Forms,
    token: { one: 'token', many: 'tokens' } as Forms,
  },

  time: {
    ago: (n: number, unit: 's' | 'm' | 'h' | 'd') => `${n}${unit} ago`,
    duration: (parts: { n: number; unit: 's' | 'm' | 'h' | 'd' }[]) => parts.map((p) => `${p.n}${p.unit}`).join(' '),
  },
};

export type Dict = typeof en;

const fr: Dict = {
  docTitle: 'Push Universal ID — qui es-tu sur Push Chain ?',
  docDescription:
    "Colle n'importe quelle adresse de n'importe quelle chaîne — découvre son Universal Executor Account (UEA) sur Push Chain Donut : statut, solde, gas, historique et applis. Lecture seule, aucun wallet à connecter.",
  logo: '⚡ Push Universal ID',
  heroTitle: 'Qui es-tu sur Push Chain ?',
  heroLedeHtml:
    "Colle une adresse de n'importe quelle chaîne (Ethereum, Base, Arbitrum, BNB, Solana) et découvre son <strong>Universal Executor Account</strong> sur Push Chain : s'il est déployé, son solde, le gas, l'historique des transactions et les applications avec lesquelles il a interagi. Rien à signer, aucun wallet à connecter — tout est lu depuis le RPC public et l'explorateur du testnet Donut.",
  langSwitcherLabel: 'Langue',

  network: {
    aria: 'Chaîne d’origine',
    reverseOption: '↩︎ C’est un UEA sur Push Chain (trouver l’origine)',
  },
  address: {
    placeholderForward: '0x… ou une adresse Solana',
    placeholderReverse: 'Adresse UEA sur Push Chain (0x…)',
    aria: 'Adresse',
  },
  search: { aria: 'Vérifier' },

  errors: {
    emptyAddress: 'Saisissez une adresse.',
    invalidReverseAddress: 'Pour une recherche inverse, saisissez une adresse UEA EVM valide sur Push Chain (0x…).',
    chooseChain: 'Choisissez une chaîne d’origine.',
    deriveUea: (m: string) => `Impossible de calculer l’UEA : ${m} Vérifiez que l’adresse est valide pour la chaîne choisie.`,
    reverseLookupFailed: (m: string) => `La recherche inverse a échoué : ${m}`,
  },

  chain: { nativeLabel: 'Push Chain (déjà ici)', unknown: 'une autre chaîne' },
  token: { generic: 'jeton' },

  loading: { steps: ['Recherche du compte', 'Calcul de l’activité', 'Préparation du résultat'] as [string, string, string] },

  copy: {
    generic: 'Copier',
    copyOriginAddress: 'Copier l’adresse d’origine',
    copyUeaAddress: 'Copier l’adresse UEA',
    shareLinkLabel: '🔗 Lien',
    shareLinkTitle: 'Copier un lien vers ce résultat',
    copiedLink: '✓ Copié',
  },

  badge: { deployed: 'UEA déployé', pending: 'UEA pas encore déployé' },

  mapping: {
    originLabel: (label: string) => `Origine (${label})`,
    originFoundLabel: 'Origine (trouvée via l’UEA)',
    arrowForward: '→ UEA →',
    arrowReverse: '← UEA ←',
    unknown: 'inconnu',
    noOriginShort: 'la fabrique n’a pas d’origine pour cet UEA',
    ueaLabel: 'Universal Executor Account · Push Chain Donut',
    noOriginNote:
      'La fabrique Push ne reconnaît pas cette adresse comme un UEA. C’est soit un simple wallet sur Push Chain, soit un UEA pas encore déployé. L’activité ci-dessous concerne l’adresse saisie.',
  },

  verify: {
    ok: '✓ L’adresse UEA a été confirmée <strong>par la fabrique Push elle-même</strong> (<code>computeUEA</code>, lecture seule) — pas seulement calculée hors chaîne.',
    pending: 'Vérification de l’adresse sur la fabrique Push on-chain…',
    mismatch:
      '⚠ Le calcul hors chaîne (CREATE2) ne correspond pas au <code>computeUEA</code> de la fabrique. Résultat hors chaîne affiché — vérifiez manuellement sur l’explorateur.',
    unavailable: 'La fabrique est indisponible pour une vérification on-chain en ce moment — l’adresse a été calculée hors chaîne (CREATE2, identique au SDK).',
  },

  hints: {
    lazyDeploy:
      'Le compte se déploie « paresseusement » — à la première transaction Universal du wallet propriétaire. L’adresse est déjà réservée de manière déterministe (CREATE2), elle ne changera donc pas.',
    gasPaid: (amount: string, n: number) => `Gas payé par les propres transactions de l’UEA : ${amount} PC (sur ${n} tx sortantes).`,
  },

  metrics: {
    balance: 'Solde de l’UEA',
    txTotal: 'Transactions au total',
    tokenTransfers: 'Transferts de jetons',
    apps: 'Applis',
    appsCounting: 'Applis (calcul…)',
    rank: 'Rang',
  },

  rank: {
    rulesSummary: 'Comment le rang est-il calculé ?',
    rules: [
      '🔘 Pas encore repéré — UEA non déployé et aucune activité',
      '🟢 Explorer — UEA déployé, un peu d’activité, mais encore peu',
      '🔵 Builder — 5+ transactions et 2+ applis, sans action cross-chain',
      '🟣 Universal Native — au moins une action cross-chain via la gateway Push',
    ],
    footnote: (counting: boolean) =>
      `Calculé uniquement à partir des métriques réelles de cet UEA, chargées ci-dessus.${counting ? ' (encore en calcul — le rang peut augmenter)' : ''}`,
    nextLevelPrefix: 'Niveau suivant : ',
    maxLevel: 'C’est le niveau le plus élevé dans cette version de l’outil.',
    labels: { none: 'Pas encore repéré', explorer: 'Explorer', builder: 'Builder', native: 'Universal Native' },
    noneReason: 'L’UEA n’est pas encore déployé et n’a aucune activité sur Push Chain.',
    noneNext: 'Effectuez votre première transaction Universal depuis le wallet d’origine — l’UEA se déploiera automatiquement.',
    nativeReason: (n: number) =>
      `A réalisé ${n} action${n === 1 ? '' : 's'} cross-chain via la gateway Push — c’est tout le sens d’« Universal » sur cette chaîne.`,
    builderReason: (tx: number, apps: number) =>
      `${tx} transaction${tx === 1 ? '' : 's'} et ${apps} appli${apps === 1 ? '' : 's'} sur Push Chain, mais pas encore d’action cross-chain.`,
    builderNext: 'Effectuez un transfert ou un appel cross-chain via la gateway Push pour devenir Universal Native.',
    explorerReason: (tx: number) => `L’UEA est déployé et compte ${tx} transaction${tx === 1 ? '' : 's'}, mais encore peu d’applis.`,
    explorerNext: 'Essayez quelques applis de plus sur Push Chain pour devenir Builder.',
  },

  actions: {
    title: 'Actions universelles',
    hint:
      'Décodé depuis <code>executeUniversalTx</code> — la vraie application cible de chaque action, pas le relayer. Les actions cross-chain via la gateway montrent la chaîne, la méthode et les arguments de l’appel à destination, le statut de livraison et un lien direct vers l’explorateur de la chaîne de destination (« fin du pont »). La livraison est <strong>confirmée sur la chaîne de destination elle-même</strong> (via son API Blockscout) : un événement <code>UniversalTxExecuted/Finalized</code> avec le même <code>subTxId</code> = ✓ livré, avec le temps de pont.',
    checking: 'Vérification de la livraison sur les chaînes de destination…',
    targetNotDecoded: 'cible non décodée',
    multicallLabel: 'multicall',
    universalTxLabel: 'universal tx',
    targetTitle: (addr: string) => `Cible : ${addr}`,
    xcCallLabel: 'appel cross-chain',
    xcTransferLabel: 'transfert cross-chain',
    xcChainTitleExact: 'chaîne de destination exacte depuis l’événement UniversalTxOutbound de la gateway',
    xcChainTitleGuess: 'chaîne déduite du jeton bridgé (aucun événement de la gateway trouvé)',
    spenderWord: 'spender',
    recipientWord: 'destinataire',
    xcCallDetailArgsTitle: 'Décodé depuis le payload de l’événement de la gateway — arguments de la méthode sur le contrat de destination',
    xcCallDetailBatchTitle: 'Appels internes du lot (multicall), décodés depuis le payload de l’événement de la gateway via le carnet d’adresses du SDK',
  },

  status: {
    sent: { text: '↗ envoyé (Push)', title: 'Envoyé depuis la gateway Push. La livraison sur le Blockscout de destination n’est pas encore confirmée (encore en route, ou cette chaîne n’a pas de Blockscout compatible CORS). Vérifiez manuellement via le lien.' },
    delivered: {
      text: (chain: string, bridge: string) => `✓ livré sur ${chain}${bridge}`,
      title: (chain: string, bridge: string) =>
        `Confirmé depuis le Blockscout de ${chain} : sa UniversalGateway/Vault a émis UniversalTxExecuted/Finalized avec le même subTxId.${bridge ? ` Temps de pont — de l’appel côté Push à l’événement de livraison à destination — ${bridge.replace(/^ · pont /, '')}.` : ''}`,
    },
    failDest: {
      text: (chain: string) => `✗ rejeté sur ${chain}`,
      title: (chain: string) => `Confirmé depuis le Blockscout de ${chain} : la destination a émis UniversalTxReverted/FundsRescued avec le même subTxId — la livraison n’a pas eu lieu.`,
    },
    failPush: { text: '✗ non exécuté (Push)', title: 'executeUniversalTx a échoué sur Push — l’action cross-chain n’a jamais été envoyée.' },
    rescued: { text: '↩ retourné (rescue)', title: 'La gateway Push a émis RescueFundsOnSourceChain pour cet universalTxId exact (sha256 du hash de la tx de cette action) et ce jeton/cette chaîne : les fonds sont revenus sur Push, la livraison n’a pas abouti.' },
  },

  bridge: {
    time: (d: string) => ` · pont ${d}`,
    endTx: (chain: string) => `fin du pont : tx ${chain} ↗`,
    endAddr: (chain: string) => `fin du pont : ${chain} ↗`,
    txTitle: (chain: string) => `Transaction de livraison sur ${chain}`,
    addrTitle: (chain: string) => `Ouvrir le destinataire sur ${chain} — fin du pont`,
    gatewayTitle: (chain: string, guessTitle: string, recipient: string | null) =>
      `Gateway → ${chain} — ${guessTitle}${recipient ? ` · destinataire ${recipient}` : ''}`,
  },

  apps: {
    title: 'Top applis de l’UEA',
    hint: 'Regroupé par appli : combien d’actions et combien de PC pour chacune. Les actions cross-chain sont regroupées par chaîne de destination exacte (depuis l’événement UniversalTxOutbound de la gateway).',
    xcBadge: 'cross-chain',
    contractTag: 'contrat',
    bridgePrefix: 'bridgé :',
    rescuedNote: (n: number) => `↩ ${n} retour${n === 1 ? '' : 's'}`,
    rescuedTitle: 'Pour cette direction, la gateway a renvoyé des fonds vers Push (RescueFundsOnSourceChain) — la livraison n’a pas abouti. Correspondance par direction.',
  },

  relayers: {
    summary: (n: number) => `Les transactions ont été soumises par des relayers Push (${n}) — l’infrastructure du réseau, qui paie le gas pour l’UEA. Afficher les adresses`,
  },

  holdings: {
    title: 'Jetons détenus par l’UEA',
    hint: 'Ce que l’UEA détient actuellement sur Push Chain (soldes actuels depuis Blockscout). Les actifs bridgés sont étiquetés avec la chaîne externe qu’ils représentent.',
    nftTag: 'NFT',
    nftUnit: 'u.',
    tokenFallback: 'jeton',
  },

  tokens: {
    title: 'Jetons passés par l’UEA',
    summary: (n: number) => `${n} jeton${n === 1 ? '' : 's'} unique${n === 1 ? '' : 's'} · jusqu’à 30 transferts chargés affichés.`,
  },

  tx: {
    title: 'Transactions de l’UEA',
    emptyTitle: 'Pas encore d’activité sur Donut',
    emptyBody:
      'Blockscout ne voit aucune transaction pour cet UEA. Pour un wallet externe, c’est normal : l’UEA apparaîtra à sa première transaction Universal. L’adresse est déjà calculée et réservée.',
  },

  pagination: {
    loadedText: (tx: number, tt: number) => `${tx} transaction${tx === 1 ? '' : 's'} et ${tt} transfert${tt === 1 ? '' : 's'} de jeton`,
    autoLoading: (page: number, loaded: string) => `Chargement du reste de l’historique en arrière-plan… page ${page}, ${loaded} jusqu’ici. Gas et top applis se mettent à jour en direct.`,
    loadingBtn: 'Chargement…',
    stopBtn: 'Arrêter',
    cappedNote: (pages: number) => ` (limite d’auto-chargement — ${pages} pages)`,
    hasMoreText: (loaded: string, cappedNote: string) => `Affichage des premiers ${loaded}${cappedNote}. Il y en a plus — charger ?`,
    loadMoreBtn: 'Charger une page de plus',
    loadAllBtn: 'Charger tout le reste',
    doneAllText: (loaded: string) => `Calculé sur tout l’historique : ${loaded} (tout ce que l’explorateur a).`,
  },

  warnings: { title: 'Certaines données sont indisponibles', balance: 'Solde', counters: 'Compteurs', transactions: 'Transactions', tokenTransfers: 'Transferts de jetons', tokenBalances: 'Soldes de jetons' },

  source: {
    footerLine: (explorer: string) =>
      `Origine↔UEA — la fabrique Push (${explorer}) et CREATE2 hors chaîne (@pushchain/core) · activité et décodage depuis Blockscout · direction cross-chain, méthode et statut — événements UniversalTxOutbound / RescueFundsOnSourceChain via eth_getLogs · `,
  },

  footerHtml: (sdkHref: string, blockscoutHref: string) =>
    `Outil en lecture seule sur les données publiques de Push Chain (testnet Donut, chain id 42101). L’UEA est calculé via le <a href="${sdkHref}" target="_blank" rel="noopener">@pushchain/core</a> officiel, l’activité — via l’<a href="${blockscoutHref}" target="_blank" rel="noopener">API Blockscout</a>. Construit par une seule personne avec l’aide de l’IA. Code : <a id="repo-link" href="#" target="_blank" rel="noopener">GitHub</a>.`,

  errBlockscoutUnreachable: (detail: string) => `Impossible de joindre Blockscout (${detail}). Le réseau est peut-être indisponible ou CORS est bloqué.`,
  errBlockscoutStatus: (status: number) => `Blockscout a répondu ${status}`,
  errRpcUnreachable: (detail: string) => `Impossible de joindre le RPC de Push Chain (${detail}).`,
  errRpcStatus: (status: number) => `Le RPC a répondu ${status}`,
  errEthCallGeneric: 'Erreur eth_call',
  errEthCallEmpty: 'Réponse eth_call vide',
  errInvalidSolanaAddress: 'Adresse Solana invalide (32 octets attendus).',

  words: {
    tx: { one: 'transaction', many: 'transactions' } as Forms,
    tokenTransfer: { one: 'transfert de jeton', many: 'transferts de jetons' } as Forms,
    app: { one: 'appli', many: 'applis' } as Forms,
    action: { one: 'action', many: 'actions' } as Forms,
    token: { one: 'jeton', many: 'jetons' } as Forms,
  },

  time: {
    ago: (n: number, unit: 's' | 'm' | 'h' | 'd') => {
      const u = unit === 's' ? 's' : unit === 'm' ? 'min' : unit === 'h' ? 'h' : 'j';
      return `il y a ${n} ${u}`;
    },
    duration: (parts: { n: number; unit: 's' | 'm' | 'h' | 'd' }[]) =>
      parts.map((p) => `${p.n} ${p.unit === 's' ? 's' : p.unit === 'm' ? 'min' : p.unit === 'h' ? 'h' : 'j'}`).join(' '),
  },
};

const es: Dict = {
  docTitle: 'Push Universal ID — ¿quién eres en Push Chain?',
  docDescription:
    'Pega cualquier dirección de cualquier cadena — descubre su Universal Executor Account (UEA) en Push Chain Donut: estado, saldo, gas, historial y apps. Solo lectura, sin conectar wallet.',
  logo: '⚡ Push Universal ID',
  heroTitle: '¿Quién eres en Push Chain?',
  heroLedeHtml:
    'Pega una dirección de cualquier cadena (Ethereum, Base, Arbitrum, BNB, Solana) y descubre su <strong>Universal Executor Account</strong> en Push Chain: si está desplegada, su saldo, el gas, el historial de transacciones y las apps con las que ha interactuado. Nada que firmar, ningún wallet que conectar — todo se lee desde el RPC público y el explorador de la testnet Donut.',
  langSwitcherLabel: 'Idioma',

  network: {
    aria: 'Cadena de origen',
    reverseOption: '↩︎ Esto es un UEA en Push Chain (buscar origen)',
  },
  address: {
    placeholderForward: '0x… o una dirección de Solana',
    placeholderReverse: 'Dirección UEA en Push Chain (0x…)',
    aria: 'Dirección',
  },
  search: { aria: 'Comprobar' },

  errors: {
    emptyAddress: 'Introduce una dirección.',
    invalidReverseAddress: 'Para una búsqueda inversa, introduce una dirección UEA EVM válida en Push Chain (0x…).',
    chooseChain: 'Elige una cadena de origen.',
    deriveUea: (m: string) => `No se pudo calcular el UEA: ${m} Comprueba que la dirección sea válida para la cadena elegida.`,
    reverseLookupFailed: (m: string) => `La búsqueda inversa falló: ${m}`,
  },

  chain: { nativeLabel: 'Push Chain (ya aquí)', unknown: 'otra cadena' },
  token: { generic: 'token' },

  loading: { steps: ['Buscando la cuenta', 'Contando la actividad', 'Preparando el resultado'] as [string, string, string] },

  copy: {
    generic: 'Copiar',
    copyOriginAddress: 'Copiar la dirección de origen',
    copyUeaAddress: 'Copiar la dirección UEA',
    shareLinkLabel: '🔗 Enlace',
    shareLinkTitle: 'Copiar un enlace a este resultado',
    copiedLink: '✓ Copiado',
  },

  badge: { deployed: 'UEA desplegada', pending: 'UEA todavía no desplegada' },

  mapping: {
    originLabel: (label: string) => `Origen (${label})`,
    originFoundLabel: 'Origen (encontrado a partir del UEA)',
    arrowForward: '→ UEA →',
    arrowReverse: '← UEA ←',
    unknown: 'desconocido',
    noOriginShort: 'la fábrica no tiene origen para este UEA',
    ueaLabel: 'Universal Executor Account · Push Chain Donut',
    noOriginNote:
      'La fábrica de Push no conoce esta dirección como un UEA. Es una wallet normal en Push Chain, o un UEA todavía no desplegado. La actividad de abajo es para la dirección introducida.',
  },

  verify: {
    ok: '✓ La dirección UEA fue confirmada <strong>por la propia fábrica de Push</strong> (<code>computeUEA</code>, solo lectura) — no solo calculada fuera de la cadena.',
    pending: 'Verificando la dirección en la fábrica de Push on-chain…',
    mismatch:
      '⚠ El cálculo fuera de la cadena (CREATE2) no coincidió con el <code>computeUEA</code> de la fábrica. Mostrando el resultado calculado offchain — verifícalo manualmente en el explorador.',
    unavailable: 'La fábrica no está disponible para verificación on-chain ahora mismo — la dirección se calculó offchain (CREATE2, idéntico al SDK).',
  },

  hints: {
    lazyDeploy:
      'La cuenta se despliega de forma “perezosa” — en la primera transacción Universal de la wallet propietaria. La dirección ya está reservada de forma determinista (CREATE2), así que no cambiará.',
    gasPaid: (amount: string, n: number) => `Gas pagado por las propias transacciones del UEA: ${amount} PC (en ${n} tx salientes).`,
  },

  metrics: {
    balance: 'Saldo del UEA',
    txTotal: 'Transacciones totales',
    tokenTransfers: 'Transferencias de token',
    apps: 'Apps',
    appsCounting: 'Apps (contando…)',
    rank: 'Rango',
  },

  rank: {
    rulesSummary: '¿Cómo se calcula el rango?',
    rules: [
      '🔘 Aún sin actividad — UEA no desplegada y sin ninguna actividad',
      '🟢 Explorer — UEA desplegada, hay algo de actividad, pero todavía poca',
      '🔵 Builder — 5+ transacciones y 2+ apps, sin acciones cross-chain',
      '🟣 Universal Native — al menos una acción cross-chain a través de la gateway de Push',
    ],
    footnote: (counting: boolean) =>
      `Calculado solo a partir de las métricas reales de este UEA, cargadas arriba.${counting ? ' (aún calculando — el rango puede subir)' : ''}`,
    nextLevelPrefix: 'Siguiente nivel: ',
    maxLevel: 'Este es el nivel más alto en esta versión de la herramienta.',
    labels: { none: 'Aún sin actividad', explorer: 'Explorer', builder: 'Builder', native: 'Universal Native' },
    noneReason: 'El UEA todavía no está desplegado y no tiene ninguna actividad en Push Chain.',
    noneNext: 'Haz tu primera transacción Universal desde la wallet de origen — el UEA se desplegará automáticamente.',
    nativeReason: (n: number) =>
      `Realizó ${n} acción${n === 1 ? '' : 'es'} cross-chain a través de la gateway de Push — ese es justo el sentido de “Universal” en esta cadena.`,
    builderReason: (tx: number, apps: number) =>
      `${tx} transacción${tx === 1 ? '' : 'es'} y ${apps} app${apps === 1 ? '' : 's'} en Push Chain, pero todavía sin acciones cross-chain.`,
    builderNext: 'Haz una transferencia o llamada cross-chain a través de la gateway de Push para convertirte en Universal Native.',
    explorerReason: (tx: number) => `El UEA está desplegado y tiene ${tx} transacción${tx === 1 ? '' : 'es'}, pero todavía pocas apps.`,
    explorerNext: 'Prueba algunas apps más en Push Chain para convertirte en Builder.',
  },

  actions: {
    title: 'Acciones universales',
    hint:
      'Decodificado desde <code>executeUniversalTx</code> — la app objetivo real de cada acción, no el relayer. Las acciones cross-chain a través de la gateway muestran la cadena, el método y los argumentos de la llamada en el destino, el estado de entrega y un enlace directo al explorador de la cadena de destino (“fin del puente”). La entrega se <strong>confirma en la propia cadena de destino</strong> (vía su API de Blockscout): un evento <code>UniversalTxExecuted/Finalized</code> con el mismo <code>subTxId</code> = ✓ entregado, con el tiempo de puente.',
    checking: 'Verificando la entrega en las cadenas de destino…',
    targetNotDecoded: 'objetivo no decodificado',
    multicallLabel: 'multicall',
    universalTxLabel: 'universal tx',
    targetTitle: (addr: string) => `Objetivo: ${addr}`,
    xcCallLabel: 'llamada cross-chain',
    xcTransferLabel: 'transferencia cross-chain',
    xcChainTitleExact: 'cadena de destino exacta desde el evento UniversalTxOutbound de la gateway',
    xcChainTitleGuess: 'cadena inferida a partir del token puenteado (no se encontró evento de la gateway)',
    spenderWord: 'spender',
    recipientWord: 'destinatario',
    xcCallDetailArgsTitle: 'Decodificado desde el payload del evento de la gateway — argumentos del método en el contrato de destino',
    xcCallDetailBatchTitle: 'Llamadas internas del lote (multicall), decodificadas desde el payload del evento de la gateway vía el directorio de direcciones del SDK',
  },

  status: {
    sent: { text: '↗ enviado (Push)', title: 'Enviado desde la gateway de Push. La entrega en el Blockscout de destino todavía no está confirmada (aún en camino, o esa cadena no tiene un Blockscout compatible con CORS). Puedes verificarlo manualmente con el enlace.' },
    delivered: {
      text: (chain: string, bridge: string) => `✓ entregado en ${chain}${bridge}`,
      title: (chain: string, bridge: string) =>
        `Confirmado desde el Blockscout de ${chain}: su UniversalGateway/Vault emitió UniversalTxExecuted/Finalized con el mismo subTxId.${bridge ? ` Tiempo de puente — desde la llamada en Push hasta el evento de entrega en el destino — ${bridge.replace(/^ · puente /, '')}.` : ''}`,
    },
    failDest: {
      text: (chain: string) => `✗ rechazado en ${chain}`,
      title: (chain: string) => `Confirmado desde el Blockscout de ${chain}: el destino emitió UniversalTxReverted/FundsRescued con el mismo subTxId — la entrega no ocurrió.`,
    },
    failPush: { text: '✗ no ejecutado (Push)', title: 'executeUniversalTx revirtió en Push — la acción cross-chain nunca se envió.' },
    rescued: { text: '↩ devuelto (rescue)', title: 'La gateway de Push emitió RescueFundsOnSourceChain para este universalTxId exacto (sha256 del hash de tx de esta acción) y este token/cadena: los fondos volvieron a Push, la entrega no se completó.' },
  },

  bridge: {
    time: (d: string) => ` · puente ${d}`,
    endTx: (chain: string) => `fin del puente: tx ${chain} ↗`,
    endAddr: (chain: string) => `fin del puente: ${chain} ↗`,
    txTitle: (chain: string) => `Transacción de entrega en ${chain}`,
    addrTitle: (chain: string) => `Abrir el destinatario en ${chain} — fin del puente`,
    gatewayTitle: (chain: string, guessTitle: string, recipient: string | null) =>
      `Gateway → ${chain} — ${guessTitle}${recipient ? ` · destinatario ${recipient}` : ''}`,
  },

  apps: {
    title: 'Apps principales del UEA',
    hint: 'Agrupado por app: cuántas acciones y cuánto PC le corresponde a cada una. Las acciones cross-chain se agrupan por cadena de destino exacta (desde el evento UniversalTxOutbound de la gateway).',
    xcBadge: 'cross-chain',
    contractTag: 'contrato',
    bridgePrefix: 'puenteado:',
    rescuedNote: (n: number) => `↩ ${n} devolución${n === 1 ? '' : 'es'}`,
    rescuedTitle: 'Para esta dirección la gateway devolvió fondos a Push (RescueFundsOnSourceChain) — la entrega no se completó. Coincidencia por dirección.',
  },

  relayers: {
    summary: (n: number) => `Las transacciones fueron enviadas por relayers de Push (${n}) — infraestructura de la red que paga el gas por el UEA. Mostrar direcciones`,
  },

  holdings: {
    title: 'Tokens que posee el UEA',
    hint: 'Lo que el UEA posee ahora mismo en Push Chain (saldos actuales desde Blockscout). Los activos puenteados están etiquetados con la cadena externa que representan.',
    nftTag: 'NFT',
    nftUnit: 'uds.',
    tokenFallback: 'token',
  },

  tokens: {
    title: 'Tokens que pasaron por el UEA',
    summary: (n: number) => `${n} token${n === 1 ? '' : 's'} único${n === 1 ? '' : 's'} · mostrando hasta 30 de las transferencias cargadas.`,
  },

  tx: {
    title: 'Transacciones del UEA',
    emptyTitle: 'Aún sin actividad en Donut',
    emptyBody:
      'Blockscout no ve transacciones para este UEA. Para una wallet externa eso es normal: el UEA aparecerá en su primera transacción Universal. La dirección ya está calculada y reservada.',
  },

  pagination: {
    loadedText: (tx: number, tt: number) => `${tx} transacción${tx === 1 ? '' : 'es'} y ${tt} transferencia${tt === 1 ? '' : 's'} de token`,
    autoLoading: (page: number, loaded: string) => `Cargando el resto del historial en segundo plano… página ${page}, ${loaded} hasta ahora. El gas y las apps principales se actualizan en vivo.`,
    loadingBtn: 'Cargando…',
    stopBtn: 'Detener',
    cappedNote: (pages: number) => ` (límite de autocarga — ${pages} páginas)`,
    hasMoreText: (loaded: string, cappedNote: string) => `Mostrando los primeros ${loaded}${cappedNote}. Hay más — ¿cargar?`,
    loadMoreBtn: 'Cargar una página más',
    loadAllBtn: 'Cargar todo lo que falta',
    doneAllText: (loaded: string) => `Contado sobre todo el historial: ${loaded} (todo lo que tiene el explorador).`,
  },

  warnings: { title: 'Algunos datos no están disponibles', balance: 'Saldo', counters: 'Contadores', transactions: 'Transacciones', tokenTransfers: 'Transferencias de token', tokenBalances: 'Saldos de token' },

  source: {
    footerLine: (explorer: string) =>
      `Origen↔UEA — la fábrica de Push (${explorer}) y CREATE2 offchain (@pushchain/core) · actividad y decodificación desde Blockscout · dirección cross-chain, método y estado — eventos UniversalTxOutbound / RescueFundsOnSourceChain vía eth_getLogs · `,
  },

  footerHtml: (sdkHref: string, blockscoutHref: string) =>
    `Herramienta de solo lectura sobre datos públicos de Push Chain (testnet Donut, chain id 42101). El UEA se calcula mediante el <a href="${sdkHref}" target="_blank" rel="noopener">@pushchain/core</a> oficial, la actividad — mediante la <a href="${blockscoutHref}" target="_blank" rel="noopener">API de Blockscout</a>. Hecho por una sola persona con ayuda de IA. Código: <a id="repo-link" href="#" target="_blank" rel="noopener">GitHub</a>.`,

  errBlockscoutUnreachable: (detail: string) => `No se pudo contactar con Blockscout (${detail}). Puede que la red no esté disponible o que CORS esté bloqueado.`,
  errBlockscoutStatus: (status: number) => `Blockscout respondió ${status}`,
  errRpcUnreachable: (detail: string) => `No se pudo contactar con el RPC de Push Chain (${detail}).`,
  errRpcStatus: (status: number) => `El RPC respondió ${status}`,
  errEthCallGeneric: 'Error de eth_call',
  errEthCallEmpty: 'Respuesta de eth_call vacía',
  errInvalidSolanaAddress: 'Dirección de Solana inválida (se esperaban 32 bytes).',

  words: {
    tx: { one: 'transacción', many: 'transacciones' } as Forms,
    tokenTransfer: { one: 'transferencia de token', many: 'transferencias de token' } as Forms,
    app: { one: 'app', many: 'apps' } as Forms,
    action: { one: 'acción', many: 'acciones' } as Forms,
    token: { one: 'token', many: 'tokens' } as Forms,
  },

  time: {
    ago: (n: number, unit: 's' | 'm' | 'h' | 'd') => {
      const u = unit === 's' ? 's' : unit === 'm' ? 'min' : unit === 'h' ? 'h' : 'd';
      return `hace ${n} ${u}`;
    },
    duration: (parts: { n: number; unit: 's' | 'm' | 'h' | 'd' }[]) =>
      parts.map((p) => `${p.n} ${p.unit}`).join(' '),
  },
};

const uk: Dict = {
  docTitle: 'Push Universal ID — хто ти на Push Chain?',
  docDescription:
    'Встав будь-яку адресу з будь-якого чейна — побач її Universal Executor Account (UEA) на Push Chain Donut: статус, баланс, газ, історію та застосунки. Read-only, без підключення гаманця.',
  logo: '⚡ Push Universal ID',
  heroTitle: 'Хто ти на Push Chain?',
  heroLedeHtml:
    "Встав адресу з будь-якого чейна (Ethereum, Base, Arbitrum, BNB, Solana) — і побач її <strong>Universal Executor Account</strong> на Push Chain: чи задеплойений, баланс, газ, історію транзакцій і застосунки, з якими він взаємодіяв. Нічого не підписуєш, гаманець не під'єднуєш — усе читається з публічного RPC та експлорера Donut-тестнету.",
  langSwitcherLabel: 'Мова',

  network: {
    aria: 'Origin-чейн',
    reverseOption: '↩︎ Це UEA на Push Chain (знайти origin)',
  },
  address: {
    placeholderForward: '0x… або Solana-адреса',
    placeholderReverse: 'UEA-адреса на Push Chain (0x…)',
    aria: 'Адреса',
  },
  search: { aria: 'Перевірити' },

  errors: {
    emptyAddress: 'Введіть адресу.',
    invalidReverseAddress: 'Для зворотного пошуку введіть валідну EVM-адресу UEA на Push Chain (0x…).',
    chooseChain: 'Оберіть origin-чейн.',
    deriveUea: (m: string) => `Не вдалося обчислити UEA: ${m} Перевірте, що адреса валідна для обраного чейна.`,
    reverseLookupFailed: (m: string) => `Не вдалося зробити зворотний пошук: ${m}`,
  },

  chain: { nativeLabel: 'Push Chain (вже тут)', unknown: 'інший чейн' },
  token: { generic: 'токен' },

  loading: { steps: ['Шукаю акаунт', 'Рахую активність', 'Готую результат'] as [string, string, string] },

  copy: {
    generic: 'Скопіювати',
    copyOriginAddress: 'Скопіювати origin-адресу',
    copyUeaAddress: 'Скопіювати адресу UEA',
    shareLinkLabel: '🔗 Посилання',
    shareLinkTitle: 'Скопіювати посилання на цей результат',
    copiedLink: '✓ Скопійовано',
  },

  badge: { deployed: 'UEA задеплойений', pending: 'UEA ще не задеплойений' },

  mapping: {
    originLabel: (label: string) => `Origin (${label})`,
    originFoundLabel: 'Origin (знайдено за UEA)',
    arrowForward: '→ UEA →',
    arrowReverse: '← UEA ←',
    unknown: 'невідомо',
    noOriginShort: 'фабрика не має origin для цього UEA',
    ueaLabel: 'Universal Executor Account · Push Chain Donut',
    noOriginNote:
      'Фабрика Push не знає цієї адреси як UEA. Це або звичайний гаманець на Push Chain, або UEA, який ще не задеплойений. Активність нижче — для самої введеної адреси.',
  },

  verify: {
    ok: '✓ Адресу UEA підтверджено <strong>на самій фабриці Push</strong> (<code>computeUEA</code>, read-only) — не лише обчислено офчейн.',
    pending: 'Перевіряю адресу на фабриці Push on-chain…',
    mismatch:
      '⚠ Офчейн-обчислення (CREATE2) не збіглося з <code>computeUEA</code> фабрики. Показую офчейн-результат — звірте вручну в експлорері.',
    unavailable: 'Фабрика зараз недоступна для on-chain перевірки — адресу обчислено офчейн (CREATE2, ідентично SDK).',
  },

  hints: {
    lazyDeploy:
      'Акаунт розгортається «ліниво» — при першій Universal-транзакції з гаманця-власника. Адреса вже зарезервована детерміновано (CREATE2), тож вона не зміниться.',
    gasPaid: (amount: string, n: number) => `Газ, сплачений власними транзакціями UEA: ${amount} PC (за ${n} вихідних tx).`,
  },

  metrics: {
    balance: 'Баланс UEA',
    txTotal: 'Транзакцій усього',
    tokenTransfers: 'Токен-трансферів',
    apps: 'Додатків',
    appsCounting: 'Додатків (рахую…)',
    rank: 'Ранг',
  },

  rank: {
    rulesSummary: 'Як рахується ранг?',
    rules: [
      '🔘 ще не на радарі — UEA не задеплойений і без жодної активності',
      '🟢 Explorer — UEA задеплойений, активність є, але ще мало',
      '🔵 Builder — 5+ транзакцій і 2+ застосунки, без крос-чейн дій',
      '🟣 Universal Native — хоча б одна крос-чейн дія через шлюз Push',
    ],
    footnote: (counting: boolean) =>
      `Рахується лише з реальних метрик цього UEA, завантажених вище.${counting ? ' (ще рахуються — ранг може підвищитись)' : ''}`,
    nextLevelPrefix: 'Наступний рівень: ',
    maxLevel: 'Це найвищий рівень у цій версії інструмента.',
    labels: { none: 'ще не на радарі', explorer: 'Explorer', builder: 'Builder', native: 'Universal Native' },
    noneReason: 'UEA ще не задеплойений і не має жодної активності на Push Chain.',
    noneNext: 'Зроби першу Universal-транзакцію з origin-гаманця — UEA розгорнеться автоматично.',
    nativeReason: (n: number) =>
      `зробив ${n} крос-чейн ${n % 10 === 1 && n % 100 !== 11 ? 'дію' : 'дій'} через шлюз Push — це й є суть «Universal» на цьому чейні.`,
    builderReason: (tx: number, apps: number) =>
      `${tx} транзакцій і ${apps} застосунки на Push Chain, але ще без крос-чейн дій.`,
    builderNext: 'Зроби крос-чейн переказ або виклик через шлюз Push, щоб стати Universal Native.',
    explorerReason: (tx: number) => `UEA задеплойений і має ${tx} транзакцій, але поки мало застосунків.`,
    explorerNext: 'Спробуй ще кілька застосунків на Push Chain, щоб стати Builder.',
  },

  actions: {
    title: 'Універсальні дії',
    hint:
      'Декодовано з <code>executeUniversalTx</code> — справжній цільовий застосунок кожної дії, а не релеєр. Крос-чейн дії через шлюз показують чейн, метод і аргументи виклику на призначенні, статус доставки та пряме посилання на експлорер чейна-призначення («кінець мосту»). Доставку <strong>підтверджуємо на самому чейні призначення</strong> (через його Blockscout API): подія <code>UniversalTxExecuted/Finalized</code> з тим самим <code>subTxId</code> = ✓ доставлено, з часом мосту.',
    checking: 'Перевіряю доставку на чейнах призначення…',
    targetNotDecoded: 'ціль не декодовано',
    multicallLabel: 'мультиколл',
    universalTxLabel: 'universal tx',
    targetTitle: (addr: string) => `ціль: ${addr}`,
    xcCallLabel: 'крос-чейн виклик',
    xcTransferLabel: 'крос-чейн переказ',
    xcChainTitleExact: 'точний чейн призначення з події шлюзу UniversalTxOutbound',
    xcChainTitleGuess: 'чейн виведено з бриджевого токена (подію шлюзу не знайдено)',
    spenderWord: 'spender',
    recipientWord: 'отримувач',
    xcCallDetailArgsTitle: 'Декодовано з payload події шлюзу — аргументи методу на контракті призначення',
    xcCallDetailBatchTitle: 'Внутрішні виклики пакета (multicall), декодовані з payload події шлюзу через ABI адресної книги SDK',
  },

  status: {
    sent: { text: '↗ надіслано (Push)', title: 'Надіслано зі шлюзу Push. Доставку з Blockscout призначення поки не підтверджено (ще в дорозі, або в того чейна немає CORS-дружнього Blockscout). Можна перевірити вручну за посиланням.' },
    delivered: {
      text: (chain: string, bridge: string) => `✓ доставлено на ${chain}${bridge}`,
      title: (chain: string, bridge: string) =>
        `Підтверджено з Blockscout самого ${chain}: його UniversalGateway/Vault емітив UniversalTxExecuted/Finalized із тим самим subTxId.${bridge ? ` Час мосту — від виклику на Push до події доставки на призначенні — ${bridge.replace(/^ · мост /, '')}.` : ''}`,
    },
    failDest: {
      text: (chain: string) => `✗ відхилено на ${chain}`,
      title: (chain: string) => `Підтверджено з Blockscout ${chain}: на призначенні емітовано UniversalTxReverted/FundsRescued з тим самим subTxId — доставка не відбулась.`,
    },
    failPush: { text: '✗ не виконано (Push)', title: 'executeUniversalTx завершився помилкою на Push — крос-чейн дію не відправлено.' },
    rescued: { text: '↩ повернуто (rescue)', title: 'Шлюз Push емітив RescueFundsOnSourceChain для цього самого universalTxId (sha256 від tx-хеша цієї дії) і цього токена/чейна: кошти повернулись на Push, доставка не завершилась.' },
  },

  bridge: {
    time: (d: string) => ` · міст ${d}`,
    endTx: (chain: string) => `кінець мосту: ${chain} tx ↗`,
    endAddr: (chain: string) => `кінець мосту: ${chain} ↗`,
    txTitle: (chain: string) => `транзакція доставки на ${chain}`,
    addrTitle: (chain: string) => `відкрити отримувача на ${chain} — кінець мосту`,
    gatewayTitle: (chain: string, guessTitle: string, recipient: string | null) =>
      `шлюз → ${chain} — ${guessTitle}${recipient ? ` · отримувач ${recipient}` : ''}`,
  },

  apps: {
    title: 'Топ-застосунки UEA',
    hint: 'Згруповано за застосунком: скільки дій і скільки PC припадає на кожен. Крос-чейн дії зведені за точним чейном призначення (з події шлюзу UniversalTxOutbound).',
    xcBadge: 'крос-чейн',
    contractTag: 'контракт',
    bridgePrefix: 'міст:',
    rescuedNote: (n: number) => `↩ ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'повернення' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'повернення' : 'повернень'}`,
    rescuedTitle: 'Для цього напрямку шлюз повернув кошти на Push (RescueFundsOnSourceChain) — доставка не завершилась. Збіг за напрямком.',
  },

  relayers: {
    summary: (n: number) => `Транзакції подавали релеєри Push (${n}) — інфраструктура мережі, вони ж сплатують газ за UEA. Показати адреси`,
  },

  holdings: {
    title: 'Токени на балансі UEA',
    hint: 'Що UEA тримає на Push Chain зараз (поточні баланси з Blockscout). Для бриджених активів показано, який зовнішній чейн вони представляють.',
    nftTag: 'NFT',
    nftUnit: 'шт',
    tokenFallback: 'токен',
  },

  tokens: {
    title: 'Токени, що проходили через UEA',
    summary: (n: number) => `${n} ${n === 1 ? 'унікальний токен' : 'унікальних токенів'} · показано до 30 трансферів із завантажених.`,
  },

  tx: {
    title: 'Транзакції UEA',
    emptyTitle: 'Поки немає активності на Donut',
    emptyBody:
      "Blockscout не бачить транзакцій цього UEA. Для зовнішнього гаманця це нормально: UEA з'явиться при першій Universal-транзакції. Адреса вже обчислена й зарезервована.",
  },

  pagination: {
    loadedText: (tx: number, tt: number) => {
      const f = (n: number, one: string, few: string, many: string) =>
        n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
      return `${tx} ${f(tx, 'транзакція', 'транзакції', 'транзакцій')} і ${tt} ${f(tt, 'токен-трансфер', 'токен-трансфери', 'токен-трансферів')}`;
    },
    autoLoading: (page: number, loaded: string) => `Фоново завантажую всю історію… сторінка ${page}, уже ${loaded}. Газ і топ-застосунки оновлюються наживо.`,
    loadingBtn: 'Завантажую…',
    stopBtn: 'Зупинити',
    cappedNote: (pages: number) => ` (ліміт автозавантаження — ${pages} сторінок)`,
    hasMoreText: (loaded: string, cappedNote: string) => `Показано перші ${loaded}${cappedNote}. Є ще — підвантажити?`,
    loadMoreBtn: 'Завантажити ще сторінку',
    loadAllBtn: 'Завантажити все, що лишилося',
    doneAllText: (loaded: string) => `Пораховано за всю історію: ${loaded} (усе, що є в експлорера).`,
  },

  warnings: { title: 'Частина даних недоступна', balance: 'Баланс', counters: 'Лічильники', transactions: 'Транзакції', tokenTransfers: 'Токен-трансфери', tokenBalances: 'Баланси токенів' },

  source: {
    footerLine: (explorer: string) =>
      `Origin↔UEA — фабрика Push (${explorer}) та offchain CREATE2 (@pushchain/core) · активність і декодування з Blockscout · крос-чейн напрямок, метод і статус — події UniversalTxOutbound / RescueFundsOnSourceChain через eth_getLogs · `,
  },

  footerHtml: (sdkHref: string, blockscoutHref: string) =>
    `Read-only інструмент на публічних даних Push Chain (Donut testnet, chain id 42101). UEA обчислюється через офіційний <a href="${sdkHref}" target="_blank" rel="noopener">@pushchain/core</a>, активність — через <a href="${blockscoutHref}" target="_blank" rel="noopener">Blockscout API</a>. Зроблено однією людиною з допомогою AI. Код: <a id="repo-link" href="#" target="_blank" rel="noopener">GitHub</a>.`,

  errBlockscoutUnreachable: (detail: string) => `Не вдалося звернутись до Blockscout (${detail}). Можливо, мережа недоступна або CORS заблоковано.`,
  errBlockscoutStatus: (status: number) => `Blockscout відповів ${status}`,
  errRpcUnreachable: (detail: string) => `Не вдалося звернутись до RPC Push Chain (${detail}).`,
  errRpcStatus: (status: number) => `RPC відповів ${status}`,
  errEthCallGeneric: 'Помилка eth_call',
  errEthCallEmpty: 'Порожня відповідь eth_call',
  errInvalidSolanaAddress: 'Невалідна Solana-адреса (очікується 32 байти).',

  words: {
    tx: { one: 'транзакція', few: 'транзакції', many: 'транзакцій' } as Forms,
    tokenTransfer: { one: 'токен-трансфер', few: 'токен-трансфери', many: 'токен-трансферів' } as Forms,
    app: { one: 'застосунок', few: 'застосунки', many: 'застосунків' } as Forms,
    action: { one: 'дія', few: 'дії', many: 'дій' } as Forms,
    token: { one: 'токен', few: 'токени', many: 'токенів' } as Forms,
  },

  time: {
    ago: (n: number, unit: 's' | 'm' | 'h' | 'd') => {
      const u = unit === 's' ? 'с' : unit === 'm' ? 'хв' : unit === 'h' ? 'год' : 'дн';
      return `${n} ${u} тому`;
    },
    duration: (parts: { n: number; unit: 's' | 'm' | 'h' | 'd' }[]) =>
      parts
        .map((p) => `${p.n} ${p.unit === 's' ? 'с' : p.unit === 'm' ? 'хв' : p.unit === 'h' ? 'год' : 'дн'}`)
        .join(' '),
  },
};

const DICTS: Record<Lang, Dict> = { en, fr, es, uk };

function detectLang(): Lang {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('lang');
    if (q && (LANGS as string[]).includes(q)) return q as Lang;
  } catch {
    /* ignore */
  }
  try {
    const saved = window.localStorage.getItem('push-uid-lang');
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  } catch {
    /* ignore */
  }
  return 'en';
}

let currentLang: Lang = detectLang();
const listeners: Array<() => void> = [];

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  try {
    window.localStorage.setItem('push-uid-lang', lang);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function onLangChange(fn: () => void): void {
  listeners.push(fn);
}

export function msg(): Dict {
  return DICTS[currentLang];
}

/** Pick the right plural form of a word for `n`, in the current language. */
export function pluralWord(n: number, forms: Forms): string {
  if (currentLang === 'uk') {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms.one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few ?? forms.many;
    return forms.many;
  }
  return n === 1 ? forms.one : forms.many;
}

/** `"{n} {word}"` with the right plural form, in the current language. */
export function countWord(n: number, forms: Forms): string {
  return `${n} ${pluralWord(n, forms)}`;
}

// Relative-time / duration formatting, available to format.ts without that
// module needing to know anything about languages beyond this one call.
export function agoText(seconds: number): string {
  const m = msg();
  if (seconds < 60) return m.time.ago(seconds, 's');
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return m.time.ago(mins, 'm');
  const h = Math.floor(mins / 60);
  if (h < 24) return m.time.ago(h, 'h');
  const d = Math.floor(h / 24);
  return m.time.ago(d, 'd');
}

export function durationText(totalSeconds: number): string {
  const m = msg();
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return m.time.duration([{ n: s, unit: 's' }]);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins < 60) return m.time.duration(rem ? [{ n: mins, unit: 'm' }, { n: rem, unit: 's' }] : [{ n: mins, unit: 'm' }]);
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  if (h < 24) return m.time.duration(mm ? [{ n: h, unit: 'h' }, { n: mm, unit: 'm' }] : [{ n: h, unit: 'h' }]);
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return m.time.duration(hh ? [{ n: d, unit: 'd' }, { n: hh, unit: 'h' }] : [{ n: d, unit: 'd' }]);
}
