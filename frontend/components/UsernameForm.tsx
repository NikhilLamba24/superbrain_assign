"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Input } from "./ui";

interface UsernameFormProps {
  onSuccess: (username: string) => void;
}

export function UsernameForm({ onSuccess }: UsernameFormProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;

    setChecking(true);
    setError(null);
    try {
      const { available } = await api.checkUsername(name);
      if (!available) {
        setError(`“${name}” is already editing. Please choose another username.`);
        setChecking(false);
        return;
      }
      onSuccess(name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setChecking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">StorySync</h1>
      <p className="mt-1 text-sm text-slate-500">Collaborative AI storyboarding</p>
      <label className="mt-8 block text-sm font-medium text-slate-700">
        Choose your username
        <Input
          className="mt-2"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. whiterabbit"
          autoFocus
          maxLength={50}
        />
      </label>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <Button type="submit" disabled={checking || !username.trim()} className="mt-4 w-full">
        {checking ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
