import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const SerialTest = () => {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<any>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  const connect = async () => {
    setError(null);
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      writerRef.current = port.writable.getWriter();
      setConnected(true);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao abrir porta");
    }
  };

  const sendTeste = async (numeroDoPerfil: number) => {
    const writer = writerRef.current;
    if (!writer) {
      setError("Porta não conectada");
      return;
    }
    const encoder = new TextEncoder();
    const payload = JSON.stringify({ teste: numeroDoPerfil }) + "\n";
    console.log("Dado enviado:", payload);
    try {
      await writer.write(encoder.encode(payload));
    } catch (e: any) {
      setError(e?.message ?? "Erro de escrita");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">Serial Test (Diagnóstico)</h1>

        <Button
          onClick={connect}
          disabled={connected}
          className="w-full h-14 text-lg"
        >
          {connected ? "✓ USB Conectado" : "1. Conectar USB"}
        </Button>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-3">
          <Button
            onClick={() => sendTeste(0)}
            disabled={!connected}
            className="h-20 text-xl"
            variant="secondary"
          >
            Enviar Perfil 0
          </Button>
          <Button
            onClick={() => sendTeste(1)}
            disabled={!connected}
            className="h-20 text-xl"
            variant="secondary"
          >
            Enviar Perfil 1
          </Button>
          <Button
            onClick={() => sendTeste(2)}
            disabled={!connected}
            className="h-20 text-xl"
            variant="secondary"
          >
            Enviar Perfil 2
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Abre o console (F12) para ver os payloads enviados.
        </p>
      </div>
    </div>
  );
};

export default SerialTest;
