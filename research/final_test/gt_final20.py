# GT 20 แผ่น — ทำจากภาพสแกน Phase 1 (view/*.jpg) ด้วยตา ก่อนรันระบบ 2B/Phase 3 · 26 ต.ค. 2569
# แถว 1–10 (เขียนในช่อง): 20 ตัวต่อแถว · ตัวอักษร = ที่เขียน · '*' = ช่องขีดฆ่า
# แถว 11–20 (ทับเส้น): ลำดับที่เขียนจริง (ตามลำดับการอ่าน) ต่อแถว
U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
def seq(start, lens, ins=None, sub=None):
    """ลำดับ A–Z ต่อเนื่องจาก start แบ่งตามความยาวแถว · ins = {(แถว, ตำแหน่ง): ตัวที่แทรก}"""
    k = U.index(start); rows = []
    for ri, n in enumerate(lens):
        s = ''.join(U[(k + i) % 26] for i in range(n)); k += n; rows.append(s)
    for (ri, pos), ch in (ins or {}).items(): rows[ri] = rows[ri][:pos] + ch + rows[ri][pos:]
    for (ri, pos), ch in (sub or {}).items(): rows[ri] = rows[ri][:pos] + ch + rows[ri][pos + 1:]   # เขียนผิดตัว (เช่น H เขียนเป็น A)
    return rows
GT = {}
GT['IMG_9855'] = dict(who='Nice', cells=[
    '*ABCDEFGHIJK*LMN*OPQ', 'RSTU*VWXY*ZABCD*EFGH', 'IJKLM*NOPQ*RSTU*VWXY', 'Z*ABCDEFGHIJ*KLMNO*P', 'QRSTU*VWXY*ZABC*DEFG',
    'HIJKLM*NOPQRS*TU*VWX', 'YZ*ABCDE*FGHIJ*KLMNO', 'PQ*RSTUVWXYZ*AB*CDEF', 'GH*JKLMNO**PQRSTUVWX', 'YZABC*DEFGH*JKLM*NOP'],
    over=seq('Q', [20] * 10))
GT['IMG_9857'] = dict(who='Nice', cells=[
    'ABCDEF*GHIJKLM*NO*PQ', 'R*STUVWX*YZABCDEF*GH', 'IJKLMN*PQRST*VWXY*ZA', 'BCDEFGHI*KLM*NOPQ*ST', 'UV*WXYZ*ABCDEF*GHIJK',
    'LMNOP*QRSTUVW*XYZ*AB', 'CDEFGH*JKLMNO*QRS*TU', 'VWX**YZABCDEFGHIJ*KL', 'MNOPQRSTU*VWXYZA*BCD', 'EFG*HIJKLMNO*PQRST*U'],
    over=seq('V', [20, 19, 20, 20, 20, 20, 20, 20, 19, 20], ins={(8, 2): 'A'}))
GT['IMG_9858'] = dict(who='Nice', cells=[
    '*ABCD*EFGHIJKLMN*OPQ', 'R*STUVWXY*ZABCDE*FGH', 'IJ*KLMNOPQ*RSTU*VWXY', 'ZAB*CDEFGHI*JKLMN*OP', 'QRST*UVWXYZ**ABCDEFG',
    'HIJKL*MNOPQR*STUV*WX', 'YZABCD*EFGHIJ*KLM*NO', 'PQRSTUV*XYZ*ABCD*EFG', 'HIJKLMNO*PQRSTU*VW*X', 'YZABCDEFG*I*JKLM*NOP'],
    over=seq('Q', [20, 19, 20, 20, 20, 20, 20, 20, 20, 20]))
GT['IMG_9859'] = dict(who='Nice', cells=[
    'ABCDEF*GHI*KLMNO*PQR', 'STUVW*XYZ*ABCDEFG*HI', 'JKL*MNOPQ*RSTUV*WXYZ', '**ABCDEFGHIJKLM*NOPQ', 'RSTUV*WXYZ**ABCDEFGH',
    '*IJKLMNOPQRSTU*VW*XY', 'ZABC*EFGHIJ*KLMNO*PQ', 'RSTU*VWXYZ*ABCDE*FGH', 'IJKLMNOPQ*RSTU*V*WXY', 'Z*ABCDEFGHIJ*KLMN*OP'],
    over=seq('Q', [20, 20, 20, 18, 20, 20, 20, 20, 20, 20], ins={(3, 0): 'X'}, sub={(8, 15): 'A'}))   # แถว 14 เขียน X ซ้ำ · แถว 19 เขียน A แทน H
GT['IMG_9860'] = dict(who='Nice', cells=[
    'A*BCDEFGHIJK*LMN*OPQ', '*RSTUVWXY*ZABCDE*FGH', 'IJK*MNO*PQRSTUV*WXYZ', 'ABC*DEFGHIJKLM*NO*PQ', 'RST*UVWXYZ*ABCDE*FGH',
    '*IJKLMNOPQRSTU*VW*XY', 'ZABCD*EFGHIJKLM*N*OP', 'Q*RSTUVW*XYZABC*DEFG', 'HI*JKLMNOPQRS*TUV*WX', 'YZ*ABCDEFGH*IJKLM*NO'],
    over=seq('P', [20, 20, 20, 19, 20, 19, 20, 20, 20, 20]))
GT['IMG_9861'] = dict(who='Nice', cells=[
    '*ABCDEFGH*IJKLMN*OPQ', 'R*STUVWX*YZAB*CDEFGH', 'IJ*KLMNOPQRST*UV*WXY', 'ZAB*DEFGHIJKLMN*O*PQ', 'RSTU*VWXYZA*BCD*EFGH',
    'IJKLMNO*PQRS*TUVWX*Y', 'ZABC*DEFGHIJ*KLM*NOP', 'QRSTU*VWXYZ*ABCD*EFG', 'HIJKLMN*OPQR*STUVW*X', 'YZ*ABCDEFGHI*JKL*MNO'],
    over=seq('P', [20, 20, 19, 20, 20, 20, 20, 19, 20, 20]))
GT['IMG_9862'] = dict(who='Nice', cells=[
    'ABC*DEFGHIJKLM*OP*QR', 'STUVW*X*YZAB*CDEFGHI', 'JKLM*NOP*QRSTUVWX*YZ', 'ABC*DEFGHIJK*LMNO*PQ', 'RSTU*VWXY*ZABCDEF*GH',
    'IJKLM*NOPQ*RSTU*VWXY', 'ZAB*CDEFGHI*JKLMN*OP', 'QRS*TUV*WXYZA*BCDEFG', '*HIJKLM*NOPQRST*UVWX', 'Y*ZABCDEFGH*IJKL*MNO'],
    over=['PQRSTUVWXYZABCDEFGHI', 'JKLMNOPQRSTUVWXYZAB', 'CDEFGHIJKLMNOPQRSTUV', 'WXYZABCDEFGHIJKLMNO', 'PQRSTUVABCDEFGHIJKLM',   # แถว 15 ข้าม WXYZ
          'NOPQRSTUVWXYZABCDEFG', 'HIJKLMNOPQRSTUVWXYZA', 'BCDEFGHIJKLMNOPQRSTU', 'VWXYZABCDEFGHIJKLMNO', 'PQRSTUVWXYZAABCDEFGH'])  # แถว 20 เขียน A ซ้ำ
GT['IMG_9863'] = dict(who='Nice', cells=[
    'ABCDE*FGHIJKLMNO*P*Q', 'R*STUVWXY*ZABCD*EFGH', 'I*JKLMNOPQRS*TUVW*XY', 'ZABCDE*FGH*IJKLM*NOP', 'QRSTU*VWXYZ*AB*CDEFG',
    'HIJ*KLMNOPQRSTU*VW*X', 'YZA*BCDEF*GHIJK*LMNO', '*PQRSTUV*WXYZAB*CDEF', 'GHIJ*KLMNOP*QRSTU*VW', 'XYZABC*DEFG*HIJKL*MN'],
    over=seq('O', [19] * 10))
GT['IMG_9864'] = dict(who='Nice', cells=[
    '*ABCDEFG*HIJKLM*NOPQ', 'R*STUVWXYZ*ABCD*EFGH', 'IJKLMNO*PQR*ST*UVWXY', 'ZABCD*EF*GHIJKLMN*OP', 'QRSTUV*WXYZA*BCDE*FG',
    'HIJKL*MNOPQR*STU*VWX', 'YZABCDE*FGHIJKLM*NOP', 'QRSTUVWXY*ZA*BCDE*FG', 'HIJKLMN*OPQ*RSTUV*WX', 'YZ*ABCDEF*GHIJKL*MNO'],
    over=seq('P', [20, 19, 17, 19, 19, 19, 20, 19, 20, 19], ins={(2, 0): 'AB'}))   # แถว 13 เขียน AB ซ้ำ
GT['IMG_9865'] = dict(who='Nice', cells=[
    'ABC*DEFGH*IJKLMNO*PQ', 'RSTUVWXY*ZABC*DE*FGH', 'IJKLMN*OPQR*STU*VWXY', 'Z*ABCDEFGH*IJK*LMNOP', 'QRSTUVWXY*ZABC*DE*FG',
    'HIJKLMNOPQ*RST*UV*WX', 'YZABC*DEFGHIJ*KL*MNO', 'PQRSTU*VWXYZ*A*BCDEF', 'GHIJKLMN*OPQ*RS*TUVW', 'XYZABCD*EFGHIJ*KL*MN'],
    over=seq('O', [20, 20, 20, 20, 19, 20, 19, 20, 19, 19]))
GT['IMG_7745'] = dict(who='Korn', cells=[
    'ABCDEFGHI**JKLMN*OPQ', 'RST*UVWXY*Z*ABCDEFGH', 'IJKLMN*O*PQRSTUV*WXY', 'ZABCDEFGHIJK*LMNOP**', 'QRSTU*VWXY**ZABCDEFG',
    'HIJ*KLMNOPQ*R*STUVWX', 'YZ*ABCD*EFGHI*JKLMNO', 'PQR*ST*UV*WXYZABCDEF', 'GHIJKLMNOPQRS**TUVW*', 'XY*ZA*BCDEF*GHIJKL*M'],
    over=seq('N', [20] * 10))
def cont(start, n, drop=(), ins=None):
    """แถว 11–20 เป็นสตริงต่อเนื่องเดียว (วัดทั้งก้อน เพราะตัวอักษรคร่อมแถวกำกวม) · drop = ดัชนีที่ผู้เขียนข้าม (นับในลำดับต่อเนื่อง) · ins = {ดัชนี: ตัวที่เขียนเกิน}"""
    k = U.index(start); s = [U[(k + i) % 26] for i in range(n + len(drop))]
    s = [c for i, c in enumerate(s) if i not in set(drop)]
    for i, ch in sorted((ins or {}).items(), reverse=True): s.insert(i, ch)
    return ''.join(s)
GT['IMG_7746'] = dict(who='Korn', cells=[
    'ABCDE*FGHIJ*KLMN*OPQ', 'RSTUV*WX*YZABC*DEFGH', 'IJKL*M*NO*PQRSTUVWXY', '*ZAB*CDEFGHIJKLMNOP*', 'QRSTUVWXY**ZABCDEFG*',
    'HI*JKLMNOP*QRST*UVWX', 'YZABCD*EFGH*IJKL*MNO', 'PQRS*TUV*WXYZABC*DEF', 'GHIJK**LMNO*PQRSTUVW', 'XYZA*BCD*EFGH*IJKLMN'],
    over=cont('O', 200, drop=(172,)))   # แถว 19 ข้าม E (ดัชนี 160 = S ต้นแถว 19 · +12 = E)
# [แก้เฉลย 26 ต.ค. 21:40 หลังรัน] IMG_7746 เดิมนับ 199 ตัว — นับใหม่จากรูป: แถว 11–18 แถวละ 20 · แถว 19 = S…M ข้าม E = 20 · แถว 20 = N…G = 20 → 200 ตัว (รูปจบที่ G) · ผลกระทบ 1 ตัว
_o = cont('P', 199)   # P..F ต่อเนื่อง · แถว 15 เขียน U ซ้ำ · แถว 17 เขียน W ซ้ำ
GT['IMG_7747'] = dict(who='Korn', cells=[
    'ABC*DEFGHIJK*LMNOP*Q', 'RST*UVWXYZAB*CDEF*GH', 'IJKLMNOPQR*STUVWXY**', 'ZABCD*FGH*IJ*KLMNOPQ', 'RSTUVWXY*ZA*BCD*EFGH',
    'IJ*KLMNOP*QRSTU*VWXY', 'ZABC*DEF*GHI*JKLMNOP', 'QRSTUVWXYZAB*CD*EF*G', 'HIJK*LMN*OPQRS*TUVWX', 'Y*ZABCDEF*G*HIJKLMNO'],
    over=_o[:84] + 'U' + _o[84:136] + 'W' + _o[136:])
GT['IMG_7748'] = dict(who='Korn', cells=[
    'A*BCDEFG*HI*JKLMNOPQ', 'RSTUVWX*YZABCD*EFGH*', 'IJKLMN*OPQRS*TUVW*XY', 'ZAB*CDEFGHI*JKL*MNOP', '*QRST*UVWXYZ*ABCDEFG',
    'HIJK**LMNOPQRST*UVWX', 'Y*ZABCDEFG*HIJK*LMNO', 'PQRST*UVWXYZA*BCD*EF', 'GH*IJKLMNO*PQRSTU*VW', 'XYZ*ABCDE*FGHIJKLMN*'],
    over=cont('O', 200))
GT['IMG_7749'] = dict(who='Korn', cells=[
    'AB*CDEFGHI*JKLMN*OPQ', 'RST*UVWX*YZABC*DEFGH', 'I*JKLMN*OPQ*RSTUVWXY', 'ZABCDEF*GHIJK*LMNOPQ', 'R*STUVWXY*ZABCDEFG*H',
    'IJKLM*NOPQRSTU*VWXY*', '*ZABC*DEFGHI*JKLMNO*', 'PQRSTUVWX*YZ*ABCDE*G', 'HIJ*KLMNOP*Q*RSTUVWX', 'YZABCDEFGH**IJKLM*NO'],
    over=cont('P', 200))
GT['IMG_7750'] = dict(who='Korn', cells=[
    'ABC*DEFG*HIJKLMN*OPQ', 'RST*UVWXYZAB*CDEFG*I', 'JKLM*NOP**QRSTUVWXYZ', 'ABCDEFGHIJ*KL*MNOP*Q', 'RSTUVWX*YZAB*CDE*FGH',
    'IJK*LMNOPQR*STUV*WXY', 'ZABCDE*FGHI**JKLMNOP', 'QRS*TUVWXY*ZA*BCDEFG', 'HIJKL*MNO*PQRST*UVWX', 'YZAB*DEFGHI**JKLMNOP'],
    over=cont('Q', 199))
GT['IMG_7751'] = dict(who='Korn', cells=[
    'ABC*DEFGHI*J*KLMNOPQ', 'RSTUVW*XY*ZAB*CDEFGH', 'IJKLM*N*OPQR*STUVWXY', 'ZABCD*EFGHIJ*KLMNO*P', 'QRSTUVWXYZ*ABCDEF**G',
    'HIJK**LMNOPQRSTUVWX*', 'YZABCDEF*GHIJKLMN**O', 'PQRST*UVWX*YZA*BCDEF', 'GHIJ*KLMNO*PQR*STUVW', 'XYZ*ABCDE*FGHIJKLM*N'],
    over=cont('O', 200))
_o = cont('M', 200)   # แถว 17 เขียน M ซ้ำ
GT['IMG_7752'] = dict(who='Korn', cells=[
    'ABCD*EFGHIJKL*MN*O*P', 'QRST*UVWX*YZA*BCDEFG', 'HIJKLM*NOPQ*RSTUV*WX', 'YZAB*CDEFG*HIJK*LMNO', 'PQRST*UVWXY*ZZABCDE*',   # แถว 5 เขียน Z สองช่อง
    'FGHIJ*KLMNOPQRST*UV*', 'WXYZABCDEF*GHIJ*KL*M', 'NOPQ*RSTUVWXY*ZA*BCD', 'EFGH*IJKL*MNO*PQRS*T', 'UVW*XYZABCDEF*GHIJKL'],
    over=_o[:131] + 'M' + _o[131:])
GT['IMG_7753'] = dict(who='Korn', cells=[
    'ABCD*EFG*HIJKLMNO*PQ', 'RST*UVWXY*ZABCDEFG*H', 'IJKL*MNOPQRSTU*VWX*Y', 'ZABC*DEFGH*IJKLMN*OP', '*QRSTUVW*XYZAB*CDEFG',
    'HIJK*LM*NOPQ*RSTUVWX', 'YZ*ABCDEFG*HIJ*KLMNO', 'PQR*S*TUVWXY*ZABCDEF', 'GH*IJKLMNO*PQRSTUV*W', 'XYZ*ABCDEFGHIJ*K*LMN'],
    over=cont('O', 200))   # หมายเหตุ: แถว 14 ตัว K เขียนคล้าย A (นับเป็น K ตามลำดับ)
GT['IMG_7754'] = dict(who='Korn', cells=[
    'A*BCDEFGHIJKLMNOP**Q', 'RSTUVWXYZ*AB*CDEF*GH', 'IJKLM*NOPQR*STUVWX*Y', 'ZABCD*EFGHI*JKLMNO*P', 'QRSTUVW*XY*Z*ABCDEFG',
    'HIJKLMNO*PQ**RSTUVWX', 'YZABCD*EFGHIJK*LM*NO', 'PQRSTU*VWXYZ*ABCDEFG', 'HIJKL*MNO*PQRS*TUVWX', 'Y*ZABCDEFG*HIJKLM*NO'],
    over=cont('P', 199))
