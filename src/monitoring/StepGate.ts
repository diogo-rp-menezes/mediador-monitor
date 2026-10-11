/** Controle de etapas exclusivamente para execuções supervisionadas pela UI. */
export interface PendingStep {
  number: number;
  stage: string;
  message: string;
  since: string;
}

export class StepGate {
  private sequence = 0;
  private waiting: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private currentStep: PendingStep | null = null;
  private cancelled = false;

  get pending(): PendingStep | null { return this.currentStep ? { ...this.currentStep } : null; }
  get isCancelled() { return this.cancelled; }

  async checkpoint(stage: string, message: string): Promise<void> {
    if (this.cancelled) throw new Error('Execução interrompida pelo usuário.');
    if (this.waiting) throw new Error('Já existe uma etapa aguardando confirmação.');
    this.currentStep = { number: ++this.sequence, stage, message, since: new Date().toISOString() };
    await new Promise<void>((resolve, reject) => { this.waiting = { resolve, reject }; });
  }

  next(): boolean {
    if (!this.waiting || this.cancelled) return false;
    const current = this.waiting;
    this.waiting = null;
    this.currentStep = null;
    current.resolve();
    return true;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.waiting) {
      const current = this.waiting;
      this.waiting = null;
      this.currentStep = null;
      current.reject(new Error('Execução interrompida pelo usuário.'));
    }
  }
}
