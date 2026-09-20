import { useState } from "react";
import {
  Box,
  Grid,
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
} from "@mui/material";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { useGetAnalyticsOverviewQuery } from "../store/adminApi";

const SERIES_COLOR = "#2a78d6";

const WINDOW_OPTIONS = [7, 30, 90] as const;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, isFetching } = useGetAnalyticsOverviewQuery({ days });

  function handleWindowChange(_e: React.MouseEvent<HTMLElement>, value: number | null) {
    if (value !== null) setDays(value);
  }

  const statusEntries = data ? Object.entries(data.bookingsByStatus) : [];

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h5">Analytics</Typography>
        <ToggleButtonGroup value={days} exclusive onChange={handleWindowChange} size="small">
          {WINDOW_OPTIONS.map((d) => (
            <ToggleButton key={d} value={d}>
              {d} days
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {(isLoading || !data) && !isFetching ? (
        <Typography>Loading...</Typography>
      ) : data ? (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard label="Total Revenue" value={`₹${data.totalRevenue.toLocaleString("en-IN")}`} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard label="Total Bookings" value={data.totalBookings.toLocaleString("en-IN")} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard label="Total Seats Sold" value={data.totalSeatsSold.toLocaleString("en-IN")} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, height: "100%" }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Bookings by Status
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {statusEntries.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No bookings in window
                    </Typography>
                  )}
                  {statusEntries.map(([status, count]) => (
                    <Chip key={status} size="small" label={`${count} ${status.toLowerCase()}`} />
                  ))}
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Revenue Over Time
            </Typography>
            <Box sx={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={data.revenueByDay} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={70} tickFormatter={(v: number) => `₹${v}`} />
                  <Tooltip
                    formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Revenue"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={SERIES_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Paper>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Top Movies
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Title</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">Bookings</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.topMovies.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3}>No data</TableCell>
                        </TableRow>
                      )}
                      {data.topMovies.map((m) => (
                        <TableRow key={m.movieId}>
                          <TableCell>{m.title}</TableCell>
                          <TableCell align="right">₹{m.revenue.toLocaleString("en-IN")}</TableCell>
                          <TableCell align="right">{m.bookings}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Top Events
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Title</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">Bookings</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.topEvents.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3}>No data</TableCell>
                        </TableRow>
                      )}
                      {data.topEvents.map((e) => (
                        <TableRow key={e.eventId}>
                          <TableCell>{e.title}</TableCell>
                          <TableCell align="right">₹{e.revenue.toLocaleString("en-IN")}</TableCell>
                          <TableCell align="right">{e.bookings}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Bookings by City
                </Typography>
                <Box sx={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.bookingsByCity} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                      <XAxis dataKey="city" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} width={40} allowDecimals={false} />
                      <Tooltip formatter={(value) => [value, "Bookings"]} />
                      <Bar dataKey="bookings" name="Bookings" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Stack>
      ) : null}
    </Box>
  );
}
