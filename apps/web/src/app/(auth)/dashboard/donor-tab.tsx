"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type PaginationState,
} from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildTokenMap,
  getTokenDisplay,
  type TokenAllowlistEntry,
} from "@/lib/donations/token";

/**
 * The Donor tab of `/dashboard`: a logged-in User sees their donation
 * history, their rank on the Global Leaderboard and on each Creator's
 * leaderboard. Profile editing is owned by the dashboard header so the user's
 * visible identity has a single source of truth.
 */

export interface DonorProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface DonorDonation {
  id: string;
  token: string;
  amount: string;
  message: string | null;
  donor_name: string;
  status: string;
  created_at: string;
  creator_profile_id: string;
}

export interface DonorPerCreatorRank {
  creator_profile_id: string;
  handle: string;
  display_name: string;
  rank: number | null;
  total: string;
  token?: string;
}

export interface DonorTabProps {
  profile: DonorProfile;
  donations: DonorDonation[];
  globalRank: { rank: number | null; total: string; token?: string };
  perCreatorRanks: DonorPerCreatorRank[];
  tokens?: TokenAllowlistEntry[];
}

const columnHelper = createColumnHelper<DonorDonation>();

function SortableHeader({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <ArrowUpDown className="size-3" aria-hidden />
    </span>
  );
}

function DonationHistoryTable({
  donations,
  tokenMap,
}: {
  donations: DonorDonation[];
  tokenMap: Map<string, TokenAllowlistEntry>;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor(
        (row) => BigInt(row.amount),
        {
          id: "amount",
          header: () => <SortableHeader label="Amount" />,
          cell: ({ row }) => {
            const display = getTokenDisplay(row.original.amount, row.original.token, tokenMap);
            return (
              <span className="font-mono">
                {display.amount}
                {display.symbol ? ` ${display.symbol}` : ""}
              </span>
            );
          },
          enableSorting: true,
        },
      ),
      columnHelper.accessor("message", {
        id: "message",
        header: "Message",
        cell: ({ getValue }) => {
          const message = getValue();
          return message ? (
            <span className="text-sm text-muted-foreground">{message}</span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          );
        },
        enableSorting: false,
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue()}</span>
        ),
        enableSorting: true,
      }),
      columnHelper.accessor("created_at", {
        id: "createdAt",
        header: () => <SortableHeader label="Date" />,
        cell: ({ getValue }) => {
          const value = getValue();
          if (!value) return null;
          return (
            <time dateTime={value} className="text-sm text-muted-foreground">
              {new Date(value).toLocaleDateString()}
            </time>
          );
        },
        enableSorting: true,
      }),
    ],
    [tokenMap],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: donations,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div data-testid="donor-history" className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
                  onClick={
                    header.column.getCanSort()
                      ? () => header.column.toggleSorting()
                      : undefined
                  }
                  aria-sort={
                    header.column.getIsSorted() === "asc"
                      ? "ascending"
                      : header.column.getIsSorted() === "desc"
                        ? "descending"
                        : "none"
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} donation
          {table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="text-sm tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DonorTab({
  donations,
  globalRank,
  perCreatorRanks,
  tokens = [],
}: DonorTabProps) {
  const tokenMap = buildTokenMap(tokens);
  const globalRankDisplay = getTokenDisplay(
    globalRank.total,
    globalRank.token,
    tokenMap,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <Card className="lg:row-span-2">
        <CardHeader>
          <CardTitle>Donation history</CardTitle>
          <CardDescription>Your past donations, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {donations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have not donated yet. Browse creators and tip to appear here.
            </p>
          ) : (
            <DonationHistoryTable donations={donations} tokenMap={tokenMap} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Leaderboard rank</CardTitle>
          <CardDescription>
            Your standing across all creators. Anonymous donations are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {globalRank.rank === null ? (
            <p className="text-sm text-muted-foreground">
              No tracked donations yet. Log in to donate and climb the board.
            </p>
          ) : (
            <div className="flex flex-col gap-1" data-testid="global-rank">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
                Your rank
              </span>
              <div className="flex items-baseline gap-2">
                <span className="stat-hero text-foreground">
                  #{globalRank.rank}
                </span>
                <span className="text-sm text-muted-foreground">
                  with {globalRankDisplay.amount}
                  {globalRankDisplay.symbol ? ` ${globalRankDisplay.symbol}` : ""} donated
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-creator ranks</CardTitle>
          <CardDescription>
            Your standing with each creator you have donated to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perCreatorRanks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Donate to a creator to see your rank with them.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="per-creator-ranks">
              {perCreatorRanks.map((r) => (
                <li
                  key={r.creator_profile_id}
                  className="row-inset flex items-center justify-between px-3 py-2"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{r.display_name}</span>
                    <span className="font-mono text-xs text-muted-foreground">@{r.handle}</span>
                  </span>
                  {r.rank === null ? (
                    <span className="text-xs text-muted-foreground">No tracked donations</span>
                  ) : (
                    <span className="font-mono text-sm text-foreground">#{r.rank}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
