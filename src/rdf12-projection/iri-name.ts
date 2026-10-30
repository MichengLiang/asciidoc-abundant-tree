// 作者写下的名字按原文进 IRI（06 号书《名字进入 IRI》）：RFC 3987 ifragment 允许的字符原样保留，其余按 UTF-8
// 逐字节写成 %XX。% 自己也总是转写，所以对名字做一次百分号解码就还原原文。
const keptAscii = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u;
const utf8 = new TextEncoder();

export function nameInIri(name: string): string {
	let written = "";
	for (const character of name) {
		written += isKept(character) ? character : percentEncoded(character);
	}
	return written;
}

// 源文件的相对路径写在文档 IRI 里、# 之前：? 在那里会被读成查询部分的开头，另写成 %3F（06 号书第 2 章「身份」）。
export function pathInIri(relativePath: string): string {
	return nameInIri(relativePath).replaceAll("?", "%3F");
}

function isKept(character: string): boolean {
	const codePoint = character.codePointAt(0) ?? 0;
	return codePoint < 0x80 ? keptAscii.test(character) : isUcschar(codePoint);
}

// RFC 3987 的 ucschar：BMP 里去掉代理区、私用区与 FDD0–FDEF、FFF0–FFFF；补充平面每面去掉末尾两个非字符，
// 第 14 面从 E1000 起；第 15、16 面是私用区，不在其中。
function isUcschar(codePoint: number): boolean {
	if (codePoint <= 0xffff) {
		return (
			(codePoint >= 0xa0 && codePoint <= 0xd7ff) ||
			(codePoint >= 0xf900 && codePoint <= 0xfdcf) ||
			(codePoint >= 0xfdf0 && codePoint <= 0xffef)
		);
	}
	if ((codePoint & 0xffff) > 0xfffd) {
		return false;
	}
	return codePoint <= 0xdffff || (codePoint >= 0xe1000 && codePoint <= 0xefffd);
}

function percentEncoded(character: string): string {
	let encoded = "";
	for (const byte of utf8.encode(character)) {
		encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
	}
	return encoded;
}
