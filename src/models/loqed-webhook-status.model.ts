export class LoqedWebhookStatus {
    requested_state!: string;
    lock_id!: number;

    constructor(init?: Partial<LoqedWebhookStatus>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}