/** 模拟层对外事件。画面和声音只消费这些结果，不能反过来改金币。 */
export type SimEvent =
    | { type: 'orderCreated'; orderId: string; recipeId: string; customerId: string }
    | { type: 'costPaid'; orderId: string; amount: number; wallet: number }
    | { type: 'cookingStarted'; orderId: string; slot: number }
    | { type: 'potReady'; orderId: string }
    | { type: 'burned'; orderId: string }
    | { type: 'delivered'; orderId: string; recipeId: string; customerId: string; income: number; tip: number }
    | { type: 'expired'; orderId: string }
    | { type: 'settled'; day: number; delivered: number; missed: number; wallet: number }
    | { type: 'upgraded'; id: string; price: number; wallet: number };

export type SimListener = (event: SimEvent) => void;
