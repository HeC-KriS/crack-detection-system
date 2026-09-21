export const formatIST = (timestamp) => {
  if (!timestamp) return "—";

  return new Date(timestamp).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  });
};