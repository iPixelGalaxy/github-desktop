import compareVersions from 'compare-versions'
import { Branch } from '../../models/branch'

export enum BranchSortOrder {
  Default = 'default',
  Version = 'version',
  Latest = 'latest',
}

export enum BranchSortDirection {
  Ascending = 'ascending',
  Descending = 'descending',
}

const branchNameComparer = new Intl.Collator('en', { numeric: true })

interface IBranchVersion {
  readonly prefixed: boolean
  readonly core: string
  readonly patch: number
  readonly version: string
}

/** Extract the application version without confusing it with a Unity target. */
function parseBranchVersion(name: string): IBranchVersion | null {
  const match =
    /v?(\d+(?:\.\d+){1,3})(?:p(\d+))?/i.exec(name) ??
    /^v?(\d+)(?:p(\d+))?$/i.exec(name)

  if (match === null) {
    return null
  }

  const prefix = name.slice(0, match.index)
  if (prefix.length > 0 && !/\p{L}/u.test(prefix)) {
    return null
  }

  const core = match[1]
  const suffix = name.slice(match.index + match[0].length)
  if (suffix.length > 0 && !suffix.startsWith('-') && !suffix.startsWith('+')) {
    return null
  }

  // A target such as -2018.3.10f1 describes compatibility, not a prerelease.
  const isUnityTarget = /^-\d+\.\d+\.\d+(?:[abcfp]\d+|x\d*)(?:[-+].*)?$/i.test(
    suffix
  )
  const version = isUnityTarget ? core : `${core}${suffix}`

  if (!compareVersions.validate(version)) {
    return null
  }

  return {
    prefixed: prefix.length > 0,
    core,
    patch: Number(match[2] ?? 0),
    version,
  }
}

/** Sort branch names without changing the repository's original branch order. */
export function sortBranches(
  branches: ReadonlyArray<Branch>,
  order: BranchSortOrder,
  direction: BranchSortDirection,
  creationDates: ReadonlyMap<string, number>
): ReadonlyArray<Branch> {
  if (order === BranchSortOrder.Default) {
    return direction === BranchSortDirection.Ascending
      ? branches
      : [...branches].reverse()
  }

  const multiplier = direction === BranchSortDirection.Ascending ? 1 : -1

  return [...branches].sort((a, b) => {
    const aName = a.nameWithoutRemote
    const bName = b.nameWithoutRemote

    if (order === BranchSortOrder.Latest) {
      const aDate = creationDates.get(a.ref)
      const bDate = creationDates.get(b.ref)

      if (aDate !== bDate) {
        if (aDate === undefined) {
          return 1
        }
        if (bDate === undefined) {
          return -1
        }
        return (aDate - bDate) * multiplier
      }
    } else {
      const aVersion = parseBranchVersion(aName)
      const bVersion = parseBranchVersion(bName)

      if ((aVersion === null) !== (bVersion === null)) {
        return aVersion === null ? 1 : -1
      }
      if (aVersion !== null && bVersion !== null) {
        // Word prefixes form a newer group, even when their numbers are lower.
        if (aVersion.prefixed !== bVersion.prefixed) {
          return (aVersion.prefixed ? 1 : -1) * multiplier
        }

        const result =
          compareVersions(aVersion.core, bVersion.core) ||
          aVersion.patch - bVersion.patch ||
          compareVersions(aVersion.version, bVersion.version)
        if (result !== 0) {
          return result * multiplier
        }
      }
    }

    return (
      (branchNameComparer.compare(aName, bName) ||
        branchNameComparer.compare(a.name, b.name)) * multiplier
    )
  })
}
