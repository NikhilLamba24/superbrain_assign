"use client";

import { useState } from "react";
import { Button, Spinner, Textarea } from "./ui";

interface PromptBarProps {
  generating: boolean;
  error: string | null;
  disabled: boolean;
  onGenerate: (prompt: string) => Promise<boolean>;
}

export function PromptBar({ generating, error, disabled, onGenerate }: PromptBarProps) {
  const [prompt, setPrompt] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = prompt.trim();
    if (!value || generating || disabled) return;
    const ok = await onGenerate(value);
    if (ok) setPrompt("");
  }

  return (
    <div className="border-t border-slate-200 bg-white px-6 py-4">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl items-end gap-3">
        <div className="flex-1">
          <Textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the next variation…"
            disabled={generating || disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e);
              }
            }}
          />
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          {generating && (
            <p className="mt-2 flex items-center gap-2 text-sm text-sky-600">
              <Spinner className="border-sky-300 border-t-sky-600" />
              Generating…
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={generating || disabled || !prompt.trim()}
          className="h-11 shrink-0"
        >
          {generating ? "Generating…" : "Generate variation"}
        </Button>
      </form>
    </div>
  );
}
