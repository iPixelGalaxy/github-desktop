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
      // Also recognize version branches such as release/v1.10.0.
      const aVersion = aName.slice(aName.lastIndexOf('/') + 1)
      const bVersion = bName.slice(bName.lastIndexOf('/') + 1)
      const aIsVersion = compareVersions.validate(aVersion)
      const bIsVersion = compareVersions.validate(bVersion)

      if (aIsVersion !== bIsVersion) {
        return aIsVersion ? -1 : 1
      }
      if (aIsVersion && bIsVersion) {
        const result = compareVersions(aVersion, bVersion)
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
