import { BehaviorSubject, Observable } from 'rxjs';
import { LockedState } from '../models/locked-state';
import { Logger } from 'homebridge';
import { LoqedStatus } from '../models/loqed-status.model';
import { LoqedWebhookStatus } from '../models/loqed-webhook-status.model';
import express from 'express';
import request from 'request';

export class LoqedService {
    public readonly lockStatus$: Observable<LoqedStatus | null>;

    private readonly lockStatusSubject: BehaviorSubject<LoqedStatus | null>;
    private server!: express.Application;

    private setStateUrl = 'https://gateway.production.loqed.com/v1/locks/{OLDLOCKID}/state?lock_api_key={APIKEY}&api_token={APITOKEN}&lock_state={STATE}&local_key_id=0';
    private getStateUrl = 'https://app.loqed.com/API/lock_status.php?api_token={APITOKEN}&lock_id={LOCKID}';

    constructor(
        private apiKey: string,
        private apiToken: string,
        private oldLockId: number,
        private lockId: string,
        webhookPort: number | undefined,
        private log: Logger
    ) {
        this.lockStatusSubject = new BehaviorSubject<LoqedStatus | null>(null);
        this.lockStatus$ = this.lockStatusSubject.asObservable();

        if (webhookPort && !isNaN(webhookPort)) {
            this.enableWebhooks(webhookPort);
        }
    }

    public enableWebhooks(port: number): void {
        this.server = express();
        this.server.use(express.json());
        this.server.post('/webhook', (req, res) => {
            const loqedWebhookStatus = new LoqedWebhookStatus(req.body);
            if (loqedWebhookStatus.lock_id !== this.oldLockId || !this.lockStatusSubject.value) {
                return;
            }

            this.log.debug('Received webhook request from', req.ip, req.hostname);
            this.log.debug(req.body);

            const newStatus = new LoqedStatus(this.lockStatusSubject.value);
            newStatus.bolt_state = req.body.requested_state;

            this.lockStatusSubject.next(newStatus);

            res.status(200).send('OK');
        });

        this.server.listen(port, () => {
            this.log.debug('Listening for webhook request on port', port);
        });
    }

    public toggle(lockedState: LockedState): Promise<void> {
        return this.changeState(lockedState === LockedState.Unlocked ? 'DAY_LOCK' : 'NIGHT_LOCK');
    }

    public async getLockedState(lockId: string): Promise<LockedState> {
        const url = this.getStateUrl
            .replace('{APITOKEN}', this.apiToken)
            .replace('{LOCKID}', lockId);

        const status = new LoqedStatus(await this.request<LoqedStatus>(url, 'GET'));
        this.lockStatusSubject.next(status);

        switch (status.bolt_state) {
            case 'day_lock':
                return LockedState.Unlocked;
            case 'night_lock':
                return LockedState.Locked;
            default:
                throw new Error('Unknown state');
        }
    }

    public async startPollingFor(lockedState: LockedState): Promise<boolean> {
        for (let i = 0; i < 5; i++) {
            const currentLockedState = await this.getLockedState(this.lockId);
            if (lockedState === currentLockedState) {
                return true;
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        return false;
    }

    private async changeState(state: string): Promise<void> {
        const url = this.setStateUrl
            .replace('{OLDLOCKID}', this.oldLockId.toString())
            .replace('{APIKEY}', encodeURIComponent(this.apiKey))
            .replace('{APITOKEN}', encodeURIComponent(this.apiToken))
            .replace('{STATE}', state);

        await this.request(url, 'GET');
    }

    private async request<T>(url: string, method: string, params: unknown = null): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.log.debug('Loqed Request to', url);
            request({
                uri: url,
                method: method,
                body: params,
                json: true,
            }, (error, response, body) => {
                this.log.debug('Loqed Response', response.statusCode, body);

                if (!error && response.statusCode === 200) {
                    resolve(body);
                }
                else {
                    if (error) {
                        reject('Error while communicating with Loqed. Error: ' + error);
                    }
                    else if (response.statusCode !== 200) {
                        reject('Error while communicating with Loqed. Status Code: ' + response.statusCode);
                    }
                    else {
                        reject();
                    }
                }
            });
        });
    }
}