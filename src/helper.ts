export const skipLineOne = (lines: string) => {
    const splits = lines.split(/\r?\n/)
    splits.shift()
    return splits.join()
}