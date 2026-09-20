import { useState } from "react";
import { TextField, IconButton, InputAdornment, type TextFieldProps } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

// A plain TextField with `type="password"` and a show/hide toggle —
// shared by every auth form (Login, Register, Reset Password) instead of
// each page wiring up its own `showPassword` state and adornment.
export function PasswordField(props: Omit<TextFieldProps, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible((v) => !v)}
              edge="end"
              tabIndex={-1}
            >
              {visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}
