import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../src/App";
import { api } from "../src/lib/api";

const me = {
  userId: 2,
  displayName: "Саша",
  communities: [{ id: 1, title: "FC Altynka", role: "organizer" }],
  kaspiPhone: null,
  telegram: {
    firstName: "Александр",
    lastName: "Тестов",
    username: "sasha",
    photoUrl: "https://t.me/i/userpic/320/profile.jpg",
  },
};
const match = {
  id: 1,
  community: { id: 1, title: "FC Altynka" },
  date: "2026-11-07",
  status: "scheduled",
  startTime: "21:00",
  durationHours: 1,
  place: "Arena",
  limit: 10,
  mainCount: 8,
  reserveCount: 0,
  my: "main",
};
const payment = {
  kind: "payment",
  id: "payment-1",
  eventId: 9,
  billId: 4,
  date: "2026-10-31",
  place: "Arena",
  due: 2500,
  receiverName: "Алихан",
  receiverKaspiPhone: "+77071234567",
  community: { id: 1, title: "FC Altynka" },
};
let identity: typeof me;
let tasks: unknown[];
let archiveAttempt: number;
let requested: string[];
let eventPaid: boolean;

beforeEach(() => {
  identity = { ...me };
  tasks = [payment];
  archiveAttempt = 0;
  requested = [];
  eventPaid = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requested.push(input);
      if (input === "/api/me") return Response.json(identity);
      if (input === "/api/notifications") return Response.json({ tasks });
      if (input === "/api/events")
        return Response.json({
          active: [
            { ...match, id: 9, date: "2026-10-31", status: "billing" },
            match,
          ],
          past: [],
        });
      if (input === "/api/events/1")
        return Response.json({
          ...match,
          status: "billing",
          comment: null,
          main: [],
          reserve: [],
          teams: null,
          bill: {
            id: 1,
            receiver: { userId: 1, name: "Алихан", kaspiPhone: "+77071234567" },
            fieldAmount: 2500,
            extras: [],
            total: 2500,
            share: 2500,
            status: "open",
            participantSignupIds: [],
            lines: [
              {
                id: 1,
                userId: 2,
                name: "Саша",
                units: 1,
                amount: 2500,
                paidAmount: eventPaid ? 2500 : null,
                state: eventPaid ? "paid" : "unpaid",
                due: eventPaid ? 0 : 2500,
              },
            ],
          },
        });
      if (input === "/api/matches")
        return Response.json({
          events: [{ ...match, id: 9, date: "2026-10-31", status: "billing" }],
          nextCursor: "2026-10-31:9",
        });
      if (input.startsWith("/api/matches?")) {
        archiveAttempt += 1;
        return archiveAttempt === 1
          ? Response.json({ error: "offline" }, { status: 503 })
          : Response.json({
              events: [
                { ...match, id: 8, date: "2026-10-24", status: "closed" },
              ],
              nextCursor: null,
            });
      }
      if (input === "/api/bills/1/paid" && init?.method === "POST") {
        tasks = [];
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected request: ${input}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

function open(path = "/") {
  const location = memoryLocation({ path, record: true });
  return {
    ...render(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <App />
      </Router>,
    ),
    location,
  };
}

test("organizer reaches creation from the central action; a billed match does not replace the next signup", async () => {
  const { location } = open();
  await screen.findByRole("heading", { name: "Ближайший матч" });
  const nav = screen.getByRole("navigation", { name: "Основная навигация" });
  expect(within(nav).getAllByRole("link")).toHaveLength(5);
  expect(
    await screen.findByRole("link", { name: /Открыть матч/ }),
  ).toHaveAttribute("href", "/event/1");
  await userEvent.click(
    within(nav).getByRole("link", { name: "Создать матч" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Новый матч" }),
  ).toBeVisible();
  expect(location.history?.at(-1)).toBe("/new");
});

test("player sees the creation sheet with an explanation instead of a form", async () => {
  identity = { ...me, communities: [{ id: 1, title: "FC Altynka", role: "player" }] };
  open("/new");
  await screen.findByText(/Создавать матчи может организатор группы/);
  expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "Основная навигация" });
  expect(within(nav).queryByRole("link", { name: "Создать матч" })).toBeNull();
  expect(within(nav).getAllByRole("link")).toHaveLength(4);
});

test("the latest played match remains on home while its bill is open", async () => {
  open();
  const latest = await screen.findByRole("region", { name: "Последний матч" });
  expect(
    within(latest).getByRole("link", { name: /31 октября/ }),
  ).toHaveAttribute("href", "/event/9?tab=bill");
});

test("returning from Kaspi refreshes a bill paid by the receiver", async () => {
  open("/event/1?tab=bill");
  await screen.findByRole("button", { name: "Перевести в Kaspi" });
  eventPaid = true;
  act(() => window.dispatchEvent(new Event("focus")));
  expect(await screen.findByText("Ты отметил оплату")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Перевести в Kaspi" }),
  ).not.toBeInTheDocument();
});

test("archive retains earlier rows on pagination failure and retries the same cursor", async () => {
  open("/matches?view=past");
  await userEvent.click(
    await screen.findByRole("button", { name: "Показать ещё" }),
  );
  expect(
    await screen.findByText("Не получилось загрузить следующие матчи"),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: /31 октября/ })).toHaveAttribute(
    "href",
    "/event/9?tab=bill",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Повторить загрузку" }),
  );
  expect(
    await screen.findByRole("link", { name: /24 октября/ }),
  ).toHaveAttribute("href", "/event/8");
  expect(
    screen.queryByRole("button", { name: "Показать ещё" }),
  ).not.toBeInTheDocument();
  expect(requested.filter((p) => p.startsWith("/api/matches?"))).toEqual([
    "/api/matches?cursor=2026-10-31%3A9",
    "/api/matches?cursor=2026-10-31%3A9",
  ]);
});

test("payment tasks link to the existing bill and disappear after a successful payment mutation", async () => {
  open("/notifications");
  const pay = await screen.findByRole("link", { name: /Перейти к оплате/ });
  expect(pay).toHaveAttribute("href", "/event/9?tab=bill");
  expect(screen.getByText(/Получатель — Алихан/)).toBeVisible();
  await act(() => api.send("POST", "/api/bills/1/paid"));
  expect(
    await screen.findByRole("heading", { name: "Новых задач нет" }),
  ).toBeVisible();
});

test("verified Telegram identity is distinct from the club name and broken photos fall back to initials", async () => {
  const { container } = open("/profile");
  expect(
    await screen.findByRole("heading", { name: "Александр Тестов" }),
  ).toBeVisible();
  expect(screen.getByText("@sasha")).toBeVisible();
  expect(screen.getByLabelText("Имя в списках")).toHaveValue("Саша");
  const image = container.querySelector("img")!;
  expect(image).toHaveAttribute(
    "src",
    "https://t.me/i/userpic/320/profile.jpg",
  );
  fireEvent.error(image);
  await waitFor(() => expect(container.querySelector("img")).toBeNull());
  expect(screen.getByText("АТ")).toBeVisible();
  expect(screen.getByRole("link", { name: /^Игроки/ })).toHaveAttribute(
    "href",
    "/players",
  );
  expect(screen.queryByText(/Игроки команды/)).toBeNull();
  expect(screen.getByRole("heading", { name: "Управление" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Команда" })).toBeNull();
});
