"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import s from "@/components/workspace/styles.module.css";
import CreateTaskModal from "@/components/workspace/CreateTaskModal";

type ChannelListItem = {
  id: string;
  kind: "team" | "contractor" | "investor";
  name: string;
  preview: string | null;
  previewAt: string | null;
  unread: number;
};
type Channels = { team: ChannelListItem[]; contractors: ChannelListItem[]; investors: ChannelListItem[] };

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  authorName: string;
  authorInitials: string;
  convertedTaskId: string | null;
  convertedTaskTitle: string | null;
};

const EMPTY: Channels = { team: [], contractors: [], investors: [] };

export default function MessagesPage() {
  const params = useSearchParams();
  const initialId = params.get("channel");
  const [channels, setChannels] = useState<Channels>(EMPTY);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [taskModal, setTaskModal] = useState<{ open: boolean; initial: string; src: string | null }>({ open: false, initial: "", src: null });
  const [newChanOpen, setNewChanOpen] = useState(false);
  const [newChanName, setNewChanName] = useState("");
  const [adminAccess, setAdminAccess] = useState<"checking" | "allowed" | "denied" | "unavailable">("checking");
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const activeIdRef = useRef<string | null>(activeId);
  const messagesRef = useRef<Msg[]>(messages);
  const fullRequestRef = useRef(0);
  const incrementalInFlightRef = useRef(false);
  activeIdRef.current = activeId;
  messagesRef.current = messages;

  // @ mention picker state.
  const [mentionUsers, setMentionUsers] = useState<{ id: string; name: string; initials: string }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    fetch("/api/workspace/mentions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.users) setMentionUsers(d.users); })
      .catch(() => undefined);
  }, []);

  // Dismiss NEW pill.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workspace_new_seen");
      const seen: string[] = raw ? JSON.parse(raw) : [];
      if (!seen.includes("messages")) {
        seen.push("messages");
        localStorage.setItem("workspace_new_seen", JSON.stringify(seen));
        window.dispatchEvent(new Event("workspace-new-seen"));
      }
    } catch { /* ignore */ }
  }, []);

  // Resolve channel-creation access without treating an unresolved request as denial.
  useEffect(() => {
    fetch("/api/auth/user")
      .then((r) => {
        if (!r.ok) throw new Error("Unable to check channel permissions");
        return r.json();
      })
      .then((d) => {
        setAdminAccess(d?.user?.role === "Admin" || d?.role === "Admin" ? "allowed" : "denied");
      })
      .catch(() => setAdminAccess("unavailable"));
  }, []);

  const loadChannels = useCallback(async (silent = false) => {
    if (!silent) {
      setChannelsLoading(true);
      setChannelsError(null);
    }
    try {
      const r = await fetch("/api/workspace/channels", { cache: "no-store" });
      if (!r.ok) throw new Error("Unable to load conversations");
      const data = (await r.json()) as Channels;
      setChannels(data);
      setActiveId((current) => current ?? data.team[0]?.id ?? null);
    } catch {
      if (!silent) setChannelsError("Unable to load conversations. Check your connection and try again.");
    } finally {
      if (!silent) setChannelsLoading(false);
    }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const loadMessages = useCallback(async (chId: string, opts?: { incremental?: boolean }) => {
    const incremental = Boolean(opts?.incremental);
    if (incremental && incrementalInFlightRef.current) return;

    const requestId = incremental ? null : ++fullRequestRef.current;
    const currentMessages = messagesRef.current;
    const after = incremental && currentMessages.length
      ? `?after=${encodeURIComponent(currentMessages[currentMessages.length - 1].createdAt)}`
      : "";

    if (incremental) {
      incrementalInFlightRef.current = true;
    } else {
      setMessagesLoading(true);
      setMessagesError(null);
    }
    try {
      const r = await fetch(`/api/workspace/channels/${chId}/messages${after}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Unable to load messages");
      const data = await r.json();
      if (activeIdRef.current !== chId || (!incremental && requestId !== fullRequestRef.current)) return;

      const incoming = (data.messages ?? []) as Msg[];
      setMessages((prev) => {
        if (!incremental) return incoming;
        const existing = new Set(prev.map((message) => message.id));
        return [...prev, ...incoming.filter((message) => !existing.has(message.id))];
      });
    } catch {
      if (!incremental && activeIdRef.current === chId && requestId === fullRequestRef.current) {
        setMessagesError("Unable to load messages. Check your connection and try again.");
      }
    } finally {
      if (incremental) {
        incrementalInFlightRef.current = false;
      } else if (activeIdRef.current === chId && requestId === fullRequestRef.current) {
        setMessagesLoading(false);
      }
    }
  }, []);

  // Load messages on channel switch.
  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    loadMessages(activeId);
    // mark as read
    fetch(`/api/workspace/channels/${activeId}/read`, { method: "PATCH" }).then(() => loadChannels(true)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Poll for new messages every 3s when visible.
  useEffect(() => {
    if (!activeId) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      await loadMessages(activeId, { incremental: true });
    };
    const id = window.setInterval(tick, 3000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [activeId, loadMessages]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length]);

  const activeChannel = useMemo(() => {
    const all = [...channels.team, ...channels.contractors, ...channels.investors];
    return all.find((c) => c.id === activeId) ?? null;
  }, [channels, activeId]);
  const channelCount = channels.team.length + channels.contractors.length + channels.investors.length;

  const send = async () => {
    const text = composer.trim();
    if (!text || !activeId) return;
    setComposer("");
    await fetch(`/api/workspace/channels/${activeId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    await loadMessages(activeId, { incremental: true });
    loadChannels();
  };

  const mentionMatches = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return mentionUsers.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionOpen, mentionQuery, mentionUsers]);

  const onComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setComposer(val);
    const caret = e.target.selectionStart ?? val.length;
    const m = val.slice(0, caret).match(/(?:^|\s)@(\w*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
    }
  };

  const applyMention = (u: { name: string }) => {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? composer.length;
    const before = composer.slice(0, caret);
    const after = composer.slice(caret);
    const replaced = before.replace(/(^|\s)@(\w*)$/, (_m, p1) => `${p1}@${u.name} `);
    setComposer(replaced + after);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(replaced.length, replaced.length);
      }
    });
  };

  const createChannel = async () => {
    if (!newChanName.trim()) return;
    await fetch("/api/workspace/channels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newChanName.trim() }),
    });
    setNewChanName("");
    setNewChanOpen(false);
    loadChannels();
  };

  const openTaskFromMessage = (m: Msg) => {
    setTaskModal({ open: true, initial: m.body.slice(0, 200), src: m.id });
  };

  const renderListGroup = (title: string, items: ChannelListItem[], addBtn?: React.ReactNode) => (
    <>
      <div className={s.msgSection}>
        <span>{title}</span>
        {addBtn}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "8px 14px 14px", fontSize: 11, color: "var(--stone)" }}>
          None yet.
        </div>
      ) : items.map((c) => (
        <button
          type="button"
          key={c.id}
          className={`${s.msgListItem} ${activeId === c.id ? s.active : ""}`}
          onClick={() => setActiveId(c.id)}
          aria-current={activeId === c.id ? "true" : undefined}
        >
          <div className={s.msgListMain}>
            <div className={s.msgListTitle}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              {c.unread > 0 ? <span className={s.unreadDot} /> : null}
            </div>
            {c.preview ? <div className={s.msgListPreview}>{c.preview}</div> : null}
          </div>
        </button>
      ))}
    </>
  );

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Messages</h1>
          <div className={s.subtitle}>Talk to your team, contractors and investors in one place.</div>
        </div>
      </div>
      <div className={s.msgWrap}>
        <div className={s.msgSidebar}>
          <div className={s.msgList}>
            {channelsLoading ? (
              <div className={s.workspaceStateCompact}>Loading channels…</div>
            ) : channelsError ? (
              <div className={s.workspaceStateCompact}>Channels unavailable</div>
            ) : channelCount === 0 ? (
              <div className={s.workspaceStateCompact}>No channels</div>
            ) : (
              <>
                {renderListGroup("Team", channels.team,
                  adminAccess === "allowed" ? (
                    <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => setNewChanOpen(true)}>+</button>
                  ) : null
                )}
                {renderListGroup("Contractors", channels.contractors)}
                {renderListGroup("Investors", channels.investors)}
              </>
            )}
          </div>
        </div>
        <div className={s.threadPane}>
          {channelsLoading ? (
            <section className={s.workspaceState} role="status" aria-live="polite">
              <div className={s.workspaceStateIcon} aria-hidden="true">◎</div>
              <h2 className={s.workspaceStateTitle}>Loading conversations…</h2>
              <p className={s.workspaceStateCopy}>Gathering your team, contractor, and investor channels.</p>
            </section>
          ) : channelsError ? (
            <section className={`${s.workspaceState} ${s.workspaceStateError}`} role="alert">
              <div className={s.workspaceStateIcon} aria-hidden="true">!</div>
              <h2 className={s.workspaceStateTitle}>Unable to load conversations</h2>
              <p className={s.workspaceStateCopy}>{channelsError}</p>
              <button type="button" className={s.btn} onClick={() => loadChannels()}>Try again</button>
            </section>
          ) : channelCount === 0 ? (
            <section className={s.workspaceState}>
              <div className={s.workspaceStateIcon} aria-hidden="true">◇</div>
              <h2 className={s.workspaceStateTitle}>No conversations yet.</h2>
              <p className={s.workspaceStateCopy} role={adminAccess === "checking" ? "status" : undefined}>
                {adminAccess === "checking" ? "Checking channel creation access…" :
                 adminAccess === "allowed" ? "Create a team channel to start a shared conversation." :
                 adminAccess === "denied" ? "Ask an administrator to create a team channel." :
                 "Channel creation access could not be verified. Refresh to try again."}
              </p>
              {adminAccess === "allowed" ? (
                <button type="button" className={s.btn} onClick={() => setNewChanOpen(true)}>Create team channel</button>
              ) : null}
            </section>
          ) : activeChannel ? (
            <>
              <div className={s.threadHead}>
                <div className={s.threadHeadTitle}>{activeChannel.name}</div>
                <div className={s.threadHeadSub}>
                  {activeChannel.kind === "team" ? "Team channel" :
                   activeChannel.kind === "contractor" ? "Direct message with contractor" :
                   "Direct message with investor"}
                </div>
              </div>
              <div className={s.threadBody} ref={threadRef}>
                {messagesLoading ? (
                  <div className={s.workspaceStateCompact} role="status" aria-live="polite">Loading messages…</div>
                ) : messagesError ? (
                  <div className={`${s.workspaceStateCompact} ${s.workspaceStateError}`} role="alert">
                    <strong>Unable to load messages</strong>
                    <span>{messagesError}</span>
                    <button type="button" className={`${s.btn} ${s.small}`} onClick={() => loadMessages(activeChannel.id)}>Try again</button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className={s.workspaceStateCompact}>
                    <strong>No messages yet.</strong>
                    <span>Start the conversation below.</span>
                  </div>
                ) : messages.map((m) => (
                  <div key={m.id} className={`${s.msgBubble} ${m.mine ? s.mine : s.theirs}`}>
                    {!m.mine ? (
                      <div className={s.msgMeta} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={s.avatar} style={{ width: 22, height: 22, fontSize: 10 }}>{m.authorInitials}</span>
                        <span>{m.authorName}</span>
                      </div>
                    ) : null}
                    <div className={s.msgText}>{m.body}</div>
                    <div className={s.msgMeta} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      {m.convertedTaskId ? (
                        <span className={s.convertedBadge}>✓ Converted to task</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openTaskFromMessage(m)}
                          style={{ background: "none", border: "none", color: "var(--marine)", fontSize: 10, cursor: "pointer", padding: 0 }}
                        >
                          Convert to task
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className={s.composer}>
                <div style={{ position: "relative", flex: 1, display: "flex" }}>
                  {mentionOpen && mentionMatches.length ? (
                    <div
                      className={s.mentionPicker}
                      id="message-mention-options"
                      role="listbox"
                      aria-label="Mention a teammate"
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        left: 0,
                        marginBottom: 6,
                        width: 240,
                        background: "#fff",
                        border: "1px solid var(--border-mid, #d0d4d9)",
                        borderRadius: 6,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        zIndex: 30,
                        overflow: "hidden",
                      }}
                    >
                      {mentionMatches.map((u, i) => (
                        <button
                          type="button"
                          key={u.id}
                          id={`message-mention-${u.id}`}
                          role="option"
                          aria-selected={i === mentionIndex}
                          onMouseDown={(e) => { e.preventDefault(); applyMention(u); }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            cursor: "pointer",
                            background: i === mentionIndex ? "#f0f7ff" : "#fff",
                            border: 0,
                            width: "100%",
                            color: "inherit",
                            font: "inherit",
                            textAlign: "left",
                          }}
                        >
                          <span className={s.avatar} style={{ width: 20, height: 20, fontSize: 9 }}>{u.initials}</span>
                          <span style={{ fontSize: 12 }}>{u.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    ref={composerRef}
                    role="combobox"
                    className={s.composerInput}
                    style={{ width: "100%" }}
                    value={composer}
                    aria-expanded={mentionOpen && mentionMatches.length > 0}
                    aria-controls={mentionOpen && mentionMatches.length > 0 ? "message-mention-options" : undefined}
                    aria-activedescendant={mentionOpen && mentionMatches.length > 0 ? `message-mention-${mentionMatches[mentionIndex]?.id}` : undefined}
                    onChange={onComposerChange}
                    onKeyDown={(e) => {
                      if (mentionOpen && mentionMatches.length) {
                        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((idx) => (idx + 1) % mentionMatches.length); return; }
                        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((idx) => (idx - 1 + mentionMatches.length) % mentionMatches.length); return; }
                        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(mentionMatches[mentionIndex]); return; }
                        if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); return; }
                      }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    placeholder="Type a message — @ to mention, Shift+Enter for newline"
                    rows={1}
                  />
                </div>
                <button
                  type="button"
                  className={`${s.btn} ${s.ghost}`}
                  onClick={() => setTaskModal({ open: true, initial: composer, src: null })}
                  title="Create a task from this draft"
                >
                  Task
                </button>
                <button type="button" className={s.btn} onClick={send} disabled={!composer.trim()}>Send</button>
              </div>
            </>
          ) : (
            <div className={s.empty} style={{ alignSelf: "center", margin: "auto" }}>
              Pick a channel to start chatting.
            </div>
          )}
        </div>
      </div>

      <CreateTaskModal
        open={taskModal.open}
        onClose={() => setTaskModal({ open: false, initial: "", src: null })}
        initialTitle={taskModal.initial}
        sourceMessageId={taskModal.src}
        onCreated={() => { if (activeId) loadMessages(activeId); }}
      />

      {newChanOpen ? (
        <div className={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setNewChanOpen(false); }}>
          <div className={s.modal} style={{ width: 380 }}>
            <div className={s.modalHead}>
              <div className={s.modalTitle}>New team channel</div>
              <button type="button" className={s.modalClose} onClick={() => setNewChanOpen(false)}>×</button>
            </div>
            <div className={s.modalBody}>
              <div className={s.field}>
                <label className={s.fieldLabel}>Channel name</label>
                <input
                  className={s.fieldInput}
                  value={newChanName}
                  onChange={(e) => setNewChanName(e.target.value)}
                  placeholder="e.g. underwriting"
                  autoFocus
                />
              </div>
            </div>
            <div className={s.modalFoot}>
              <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => setNewChanOpen(false)}>Cancel</button>
              <button type="button" className={s.btn} onClick={createChannel} disabled={!newChanName.trim()}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
