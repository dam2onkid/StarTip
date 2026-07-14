"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, EyeIcon, EyeOffIcon } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type PaginationState,
} from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardHeader,
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
import { Badge } from "@/components/ui/badge";
import { createBrowserClient } from "@/lib/supabase/client";
import { updateDonationModerationStatus } from "@/lib/creators/moderation";
import { buildTokenMap, getTokenDisplay } from "@/lib/donations/token";
import type { TokenAllowlistEntry } from "@/lib/donations/token";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CardTitleWithInfo, EmptyState } from "../shared";
import type { CreatorActiveData, CreatorDonationRow } from "../types";

const columnHelper = createColumnHelper<CreatorDonationRow>();

function SortableHeader({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <ArrowUpDown className="size-3" aria-hidden />
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const hidden = status === "hidden";
  return (
    <Badge variant={hidden ? "secondary" : "default"}>
      <span className="mr-1 inline-block size-1.5 rounded-full bg-current" aria-hidden />
      {hidden ? "Hidden" : "Visible"}
    </Badge>
  );
}

function DonorCell({
  name,
  message,
}: {
  name: string | null;
  message: string | null;
}) {
  const displayName = name || "Anonymous supporter";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{displayName}</span>
      {message ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="max-w-[16rem] truncate text-xs text-muted-foreground">
              {message}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            <p className="max-w-xs break-words">{message}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-xs text-muted-foreground">No message</span>
      )}
    </div>
  );
}

function ToggleButton({
  row,
  busyId,
  onToggle,
}: {
  row: CreatorDonationRow;
  busyId: string | null;
  onToggle: (row: CreatorDonationRow) => void;
}) {
  const hidden = row.moderation_status === "hidden";
  const Icon = hidden ? EyeIcon : EyeOffIcon;
  return (
    <Button
      type="button"
      size="sm"
      variant={hidden ? "secondary" : "outline"}
      onClick={() => onToggle(row)}
      loading={busyId === row.id}
      disabled={busyId === row.id}
      data-testid={`moderation-toggle-${row.id}`}
      aria-label={`${hidden ? "Show" : "Hide"} donation ${row.id}`}
    >
      <Icon aria-hidden />
      {hidden ? "Show" : "Hide"}
    </Button>
  );
}

function getColumns(
  tokenMap: Map<string, TokenAllowlistEntry>,
  busyId: string | null,
  onToggle: (row: CreatorDonationRow) => void,
) {
  return [
    columnHelper.accessor(
      (row) => getTokenDisplay(row.amount, row.token, tokenMap),
      {
        id: "amount",
        header: () => <SortableHeader label="Amount" />,
        cell: ({ getValue }) => {
          const display = getValue();
          return (
            <span>
              {display.amount}
              {display.symbol ? ` ${display.symbol}` : ""}
            </span>
          );
        },
        enableSorting: true,
      },
    ),
    columnHelper.accessor((row) => ({ name: row.donor_name, message: row.message }), {
      id: "donor",
      header: "Donor",
      cell: ({ getValue }) => {
        const { name, message } = getValue();
        return <DonorCell name={name} message={message} />;
      },
      enableSorting: false,
    }),
    columnHelper.accessor("moderation_status", {
      id: "status",
      header: () => <SortableHeader label="Status" />,
      cell: ({ getValue }) => <StatusBadge status={getValue()} />,
      enableSorting: true,
    }),
    columnHelper.accessor("created_at", {
      id: "createdAt",
      header: () => <SortableHeader label="Received" />,
      cell: ({ getValue }) => {
        const value = getValue();
        if (!value) return null;
        return (
          <time dateTime={value} className="text-muted-foreground">
            {new Date(value).toLocaleString()}
          </time>
        );
      },
      enableSorting: true,
    }),
    columnHelper.display({
      id: "action",
      header: "Action",
      cell: ({ row }) => (
        <ToggleButton row={row.original} busyId={busyId} onToggle={onToggle} />
      ),
      enableSorting: false,
    }),
  ];
}

/** Moderation: list incoming donations (including hidden), toggle visibility. */
export function ModerationCard({
  activeData,
  tokens = [],
}: {
  activeData?: CreatorActiveData;
  tokens?: TokenAllowlistEntry[];
}) {
  const recent = useMemo(() => activeData?.recent ?? [], [activeData?.recent]);
  const [rows, setRows] = useState<CreatorDonationRow[]>(recent);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const tokenMap = useMemo(() => buildTokenMap(tokens), [tokens]);
  const visibleCount = rows.filter((row) => row.moderation_status !== "hidden").length;
  const hiddenCount = rows.length - visibleCount;

  // Keep local rows in sync when the server-provided snapshot changes.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setRows(recent);
    }, 0);
    return () => window.clearTimeout(id);
  }, [recent]);

  async function toggle(row: CreatorDonationRow) {
    const next = row.moderation_status === "visible" ? "hidden" : "visible";
    setBusyId(row.id);
    try {
      const supabase = createBrowserClient();
      const res = await updateDonationModerationStatus(supabase, row.id, next);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update moderation status.");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, moderation_status: next } : r)),
      );
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo(
    () => getColumns(tokenMap, busyId, toggle),
    [tokenMap, busyId],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <Card className="creator-moderation-card">
      <CardHeader>
        <div className="creator-moderation-heading">
          <CardTitleWithInfo
            title="Moderation"
            info="Toggle a donation's visibility. Hidden donations do not appear on the Overlay."
          />
          <dl className="creator-moderation-summary" aria-label="Donation visibility summary">
            <div>
              <dt>Visible</dt>
              <dd>{visibleCount}</dd>
            </div>
            <div>
              <dt>Hidden</dt>
              <dd>{hiddenCount}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{rows.length}</dd>
            </div>
          </dl>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="creator-moderation-empty">
            <EmptyState
              eyebrow="No Donations"
              message="New donations will land here with visibility controls for your overlay."
            />
          </div>
        ) : (
          <div data-testid="moderation-list" className="flex flex-col gap-4">
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
                    <TableRow
                      key={row.id}
                      data-state={row.original.moderation_status === "hidden" ? "hidden" : "visible"}
                    >
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
        )}
      </CardContent>
    </Card>
  );
}
