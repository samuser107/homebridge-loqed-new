import { LockedState } from './locked-state';

export class LoqedStatus {
    id!: string;
    battery_percentage!: number;
    battery_type!: number;
    bolt_state!: string;
    guest_access_mode!: number;
    twist_assist!: number;
    touch_to_connect!: number;
    lock_direction!: number;
    bolt_state_numeric!: number;

    constructor(init?: Partial<LoqedStatus>) {
        if (init) {
            Object.assign(this, init);
        }
    }

    get state(): LockedState {
        switch (this.bolt_state) {
            case 'day_lock':
                return LockedState.Unlocked;
            case 'night_lock':
                return LockedState.Locked;
            default:
                throw new Error('Unknown state');
        }
    }
}