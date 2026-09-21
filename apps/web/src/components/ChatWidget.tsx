import { useState, useRef, useEffect, type FormEvent, type ReactNode } from "react";
import {
  Fab,
  Paper,
  Box,
  Stack,
  Typography,
  IconButton,
  TextField,
  Button,
  Avatar,
  CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Link as RouterLink } from "react-router-dom";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useChatWithAssistantMutation } from "../store/api";
import type { AssistantChatMessageDTO } from "@showtime/shared";

// A tiny hand-rolled renderer for the assistant's markdown-lite replies —
// `[label](/path)` internal links and `**bold**` only, deliberately not a
// full markdown library (this widget is lazy-loaded specifically to keep
// that dependency weight off the main bundle; see App.tsx). Internal
// links become real react-router Links so clicking through to a seat map
// or movie page is a client-side navigation, not a full reload.
function renderAssistantContent(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  const renderBold = (text: string): ReactNode[] =>
    text.split(/(\*\*[^*]+\*\*)/g).map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`b-${key++}`}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

  while ((match = linkPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderBold(content.slice(lastIndex, match.index)));
    }
    nodes.push(
      <RouterLink key={`link-${key++}`} to={match[2]} style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>
        {match[1]}
      </RouterLink>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push(...renderBold(content.slice(lastIndex)));
  }
  return nodes;
}

const OPENING_MESSAGE =
  "Ask me to find a movie, check showtimes, or look up an offer! I can point you to the right page, but you'll still pick seats and pay through ShowTime's normal booking flow.";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [chatWithAssistant, { isLoading }] = useChatWithAssistantMutation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    const nextMessages: AssistantChatMessageDTO[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    try {
      const reply = await chatWithAssistant(nextMessages).unwrap();
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Sorry, something went wrong on my end — please try again." },
      ]);
    }
  };

  return (
    <>
      {open && (
        <Paper
          elevation={12}
          sx={{
            position: "fixed",
            bottom: { xs: 88, sm: 96 },
            right: { xs: 16, sm: 24 },
            width: { xs: "calc(100vw - 32px)", sm: 360 },
            maxWidth: 400,
            height: { xs: "min(70vh, 480px)", sm: 480 },
            display: "flex",
            flexDirection: "column",
            zIndex: (theme) => theme.zIndex.tooltip,
            border: "1px solid",
            borderColor: "divider",
            overflow: "hidden",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            }}
          >
            <AutoAwesomeIcon color="secondary" fontSize="small" />
            <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
              ShowTime Assistant
            </Typography>
            <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close chat">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Box ref={scrollRef} sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
            <Stack spacing={1.25}>
              {messages.length === 0 && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: "action.hover",
                    maxWidth: "90%",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {OPENING_MESSAGE}
                  </Typography>
                </Box>
              )}
              {messages.map((m, i) => (
                <Box
                  key={i}
                  sx={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    display: "flex",
                    gap: 1,
                    flexDirection: m.role === "user" ? "row-reverse" : "row",
                  }}
                >
                  {m.role === "assistant" && (
                    <Avatar sx={{ width: 26, height: 26, bgcolor: "secondary.main" }}>
                      <AutoAwesomeIcon sx={{ fontSize: 14, color: "#1a1a1a" }} />
                    </Avatar>
                  )}
                  <Box
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      bgcolor: m.role === "user" ? "primary.main" : "action.hover",
                      color: m.role === "user" ? "primary.contrastText" : "text.primary",
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }} component="div">
                      {m.role === "assistant" ? renderAssistantContent(m.content) : m.content}
                    </Typography>
                  </Box>
                </Box>
              ))}
              {isLoading && (
                <Box sx={{ display: "flex", gap: 1, alignSelf: "flex-start" }}>
                  <Avatar sx={{ width: 26, height: 26, bgcolor: "secondary.main" }}>
                    <AutoAwesomeIcon sx={{ fontSize: 14, color: "#1a1a1a" }} />
                  </Avatar>
                  <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}>
                    <Typography variant="body2" color="text.secondary">
                      …
                    </Typography>
                  </Box>
                </Box>
              )}
            </Stack>
          </Box>

          <Box
            component="form"
            onSubmit={handleSend}
            sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1 }}
          >
            <TextField
              size="small"
              fullWidth
              placeholder="Ask about a movie, showtime, or offer…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={isLoading || !input.trim()}
              sx={{ minWidth: 0, px: 1.5 }}
              aria-label="Send message"
            >
              {isLoading ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
            </Button>
          </Box>
        </Paper>
      )}

      <Fab
        color="primary"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        sx={{
          position: "fixed",
          bottom: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          zIndex: (theme) => theme.zIndex.tooltip,
        }}
      >
        {open ? <CloseIcon /> : <ChatBubbleOutlineIcon />}
      </Fab>
    </>
  );
}
