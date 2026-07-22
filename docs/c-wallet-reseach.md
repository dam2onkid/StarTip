# C-wallet và sponsored Soroban transactions trên Stellar

> Tài liệu nghiên cứu và định hướng tích hợp cho StarTip. Thông tin được kiểm tra ngày 2026-07-22. Chỉ sử dụng nguồn sơ cấp từ Stellar Development Foundation, đặc tả Stellar, OpenZeppelin và các kho mã chính thức của họ.

## 1. Kết luận ngắn

StarTip chọn `smart-account-kit` làm framework duy nhất cho C-wallet từ
v0.3.0. Passkey Kit không còn nằm trên implementation path.

Mô hình phù hợp cho StarTip là:

1. Donor sở hữu tài sản trong một contract account có địa chỉ `C...`.
2. Passkey chỉ là signer kiểm soát contract account, không phải địa chỉ Stellar và không phải transaction source.
3. Donor ký một `SorobanAuthorizationEntry` mô tả chính xác cây lời gọi được cho phép.
4. Sponsor/relayer dùng G-account của StarTip làm transaction source, trả phí mạng bằng XLM, tiêu sequence number và gửi transaction.
5. Smart-wallet contract kiểm tra chữ ký và policy trong `__check_auth` trước khi DonationRouter được phép chuyển tiền.

Đây là phân tách bảo mật quan trọng nhất: Sponsor có quyền trả phí và gửi transaction, nhưng không được có quyền chi tiêu tài sản của donor. Stellar xác nhận C-account không thể ký transaction envelope hoặc làm transaction source, nó chỉ có thể authorize bằng auth entry; một G-account riêng phải trả phí và submit. [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)

Khuyến nghị triển khai theo hai tầng:

- Giai đoạn hiện tại: StarTip tự sponsor toàn bộ XLM fee qua relayer G-account có allowlist chặt, không thu lại phí từ donor.
- Giai đoạn sau: chỉ dùng OpenZeppelin FeeForwarder nếu StarTip thực sự cần donor trả lại phí bằng USDC hoặc token khác. Fee abstraction thêm approval, báo giá, swap và trust boundary không cần thiết cho UX donate được trợ phí hoàn toàn.

## 2. Thuật ngữ và các khái niệm dễ nhầm

| Khái niệm | Vai trò | Không phải là |
| --- | --- | --- |
| G-account | Stellar account truyền thống, có keypair, sequence và có thể làm transaction source | Smart wallet contract |
| C-account / contract account | Soroban contract triển khai `CustomAccountInterface` và `__check_auth` | Transaction source hoặc keypair |
| Passkey | WebAuthn credential tạo chữ ký P-256 trên thiết bị | Stellar address |
| Auth entry | Quyền thực hiện một cây invocation cụ thể, có nonce và expiration ledger | Chữ ký cho toàn bộ transaction envelope |
| Sponsor / fee payer | G-account trả network fee bằng XLM và tiêu sequence | Chủ sở hữu tiền trong C-account |
| Relayer | Dịch vụ dựng lại, kiểm tra, ký và submit transaction bằng Sponsor | Thành phần được phép tự ý sửa intent đã ký |
| Fee bump | Outer envelope để một account khác trả fee cho inner transaction đã ký | Cơ chế policy của smart wallet |
| Sponsored reserves | Một account trả base reserve cho ledger entries của G-account khác | Sponsored Soroban fee |
| Fee abstraction | Relayer trả XLM rồi thu lại phí bằng token qua FeeForwarder | Bắt buộc để có gasless UX |

Fee bump và sponsored reserves là các primitive khác nhau. Fee bump tách account tiêu sequence khỏi account trả fee bằng một outer envelope; sponsored reserves tài trợ minimum balance cho các ledger entries của account truyền thống. C-account flow của StarTip đã có Sponsor G-account làm source, nên fee bump chỉ là một lớp bổ sung, không phải điều kiện bắt buộc. [Fee-bump transactions](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)

## 3. Contract account và `__check_auth`

### 3.1 Contract account là gì

Một contract trở thành contract account khi triển khai `CustomAccountInterface`. Interface dành riêng này có hàm `__check_auth`. Soroban Host tự gọi hàm đó khi một contract gọi `require_auth()` hoặc `require_auth_for_args()` cho địa chỉ C-account. Ứng dụng không gọi `__check_auth` như một public entrypoint thông thường. [Stellar contract authorization](https://developers.stellar.org/docs/build/guides/auth/contract-authorization)

Hàm nhận ba nhóm dữ liệu:

- `signature_payload`: hash 32 byte do Host xây dựng từ authorization preimage.
- `signature`: kiểu dữ liệu do account contract tự định nghĩa, có thể chứa một chữ ký, nhiều chữ ký hoặc payload policy.
- `auth_context`: các invocation đang được authorize, gồm root call và các sub-invocation.

Contract account chịu trách nhiệm cho cả hai lớp:

- Authentication: signer có thực sự tạo chữ ký hợp lệ hay không.
- Authorization: signer đó được phép làm gì trong context hiện tại.

Host xử lý expiration và nonce trước khi gọi `__check_auth`. Nonce phải duy nhất trong các chữ ký chưa hết hạn, còn auth entry gắn với đúng invocation tree và network. [Authorization fundamentals](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)

### 3.2 `SorobanAuthorizationEntry`

Một auth entry gồm:

- Credentials của address authorizer.
- `rootInvocation`, chứa contract address, function, arguments và toàn bộ sub-invocations được cho phép.
- Với address credentials: address, nonce, `signatureExpirationLedger` và signature.

Chữ ký được tạo trên SHA-256 của preimage `ENVELOPE_TYPE_SOROBAN_AUTHORIZATION`, trong đó có network ID, nonce, expiration ledger và invocation tree. Vì thế auth entry không phải là một chữ ký tùy ý có thể tái sử dụng cho giao dịch khác. [Soroban transaction and authorization structures](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction)

Stellar khuyến nghị cửa sổ expiration ngắn, thường 12 đến 60 ledgers, khoảng 1 đến 5 phút. Chữ ký hợp lệ đến hết `signatureExpirationLedger`. [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)

### 3.3 Policy phải kiểm tra toàn bộ cây lời gọi

Allowlist chỉ kiểm tra root contract là chưa đủ. `__check_auth` phải duyệt cả root invocation và sub-invocations để chặn một contract được cho phép gọi tiếp một token hoặc recipient không được phép. Stellar nêu rõ yêu cầu này trong hướng dẫn advanced contract account. [Advanced contract account patterns](https://developers.stellar.org/docs/build/guides/contract-accounts/advanced-patterns)

Đối với StarTip, policy tối thiểu nên ràng buộc:

- Root hoặc call path phải đi qua DonationRouter đã pin.
- Function phải là entrypoint donate đã định nghĩa.
- Token contract phải nằm trong allowlist.
- Creator/recipient và amount phải đúng intent mà UI hiển thị.
- Không có sub-invocation ngoài DonationRouter, token contract và các call đã dự kiến.
- Amount phải dương và không vượt giới hạn theo lần hoặc theo cửa sổ thời gian.

## 4. Passkey và WebAuthn

WebAuthn tạo keypair trên authenticator, giữ private key trên thiết bị hoặc trong hệ sinh thái đồng bộ passkey. Passkey thường dùng secp256r1/P-256. Stellar đã bật native secp256r1 verification từ Protocol 21, cho phép contract xác minh chữ ký này on-chain. [Smart wallets](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets), [CAP-0051](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0051.md)

Luồng cơ bản:

1. Registration tạo WebAuthn credential.
2. Ứng dụng lấy public key P-256 và, nếu cần, credential ID.
3. Factory triển khai C-account với public key hoặc signer configuration ban đầu.
4. Khi donate, client dùng authorization digest làm WebAuthn challenge.
5. Authenticator trả assertion.
6. Assertion được chuyển thành signature payload mà `__check_auth` hoặc verifier contract hiểu.

Theo OpenZeppelin, WebAuthn external signer dùng public key P-256 uncompressed 65 byte. Signature data được XDR encode và chứa chữ ký 64 byte, `authenticator_data` và `client_data`; hai trường sau mang RP ID hash, flags, counter, challenge, type và origin. [OpenZeppelin signers and verifiers](https://docs.openzeppelin.com/stellar-contracts/accounts/signers-and-verifiers)

Các yêu cầu tích hợp không được bỏ qua:

- Ràng buộc challenge với đúng authorization digest, không ký text do client tự khai báo.
- Kiểm tra `type = webauthn.get`, user presence và yêu cầu user verification theo policy sản phẩm.
- Ràng buộc RP ID và origin trong registration/login layer của ứng dụng, không giả định on-chain P-256 verification tự giải quyết toàn bộ WebAuthn ceremony.
- Chuẩn hóa DER `(r,s)` từ authenticator sang định dạng verifier yêu cầu.
- Pin đúng verifier address theo network và xác minh Wasm hash/deployment.
- Không ghi private key, assertion hoặc raw secret vào log.
- Có quy trình thêm, thu hồi và thay thế credential khi người dùng đổi hoặc mất thiết bị.

## 5. Fee payer, C-account và Sponsor

### 5.1 Hai chữ ký có mục đích khác nhau

Trong sponsored C-account transaction có hai lớp độc lập:

| Lớp | Bên ký | Cho phép |
| --- | --- | --- |
| Soroban auth entry | Passkey/signer của C-account | Invocation tree cụ thể được phép dùng tài sản hoặc quyền của donor |
| Transaction envelope | Sponsor G-account | Trả XLM fee, tiêu sequence và submit transaction |

C-account không có keypair truyền thống, không thể ký envelope và không thể làm transaction source. Sponsor không cần và không được giữ passkey/private key của donor. [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)

### 5.2 Sponsor trả những gì

Sponsor G-account trả:

- Inclusion fee.
- Soroban resource fee từ CPU, memory, ledger I/O, footprint và event size.
- Rent/TTL-related cost được tính trong transaction khi có thay đổi storage.
- Chi phí deploy smart-wallet contract trong onboarding nếu StarTip tài trợ deployment.

Smart account không cần duy trì minimum XLM balance như G-account. Tuy nhiên relayer G-account vẫn phải có XLM đủ cho fee và hoạt động sequence. OpenZeppelin cũng phân biệt rõ đặc điểm này trong mô hình fee abstraction. [OpenZeppelin Fee Abstraction](https://docs.openzeppelin.com/stellar-contracts/fee-abstraction)

### 5.3 Ba mô hình relayer

#### A. Relayer riêng, StarTip trả toàn bộ fee

Relayer nhận intent hoặc signed auth entry, dựng transaction bằng Sponsor G-account, re-simulate, ký envelope và submit. Donor không trả phí token.

Đây là lựa chọn khuyến nghị cho StarTip giai đoạn đầu vì có ít contract call và trust boundary nhất. Cần tự triển khai sequence lanes, idempotency, rate limit, allowlist, monitoring và key management.

#### B. OpenZeppelin Relayer / Channels

OpenZeppelin Relayer là dịch vụ self-hostable, hỗ trợ Stellar Public Network, Testnet, policy, status tracking và signer management. Channels plugin dùng pool channel accounts để submit song song và automatic fee bumping. [OpenZeppelin Relayer](https://docs.openzeppelin.com/relayer/1.5.x), [Channels plugin](https://docs.openzeppelin.com/relayer/1.5.x/plugins/channels)

Phù hợp khi StarTip cần throughput cao, queue, nhiều channel accounts và vận hành chuẩn hóa. Pin nhánh tài liệu stable `v1.5.x`, không tích hợp theo trang `Development` hoặc `main` chưa phát hành. Tài liệu tổng quan hiện ghi Stellar là "Partial support", vì vậy phải chạy testnet soak test cho đúng loại transaction và auth flow của StarTip trước mainnet.

#### C. OpenZeppelin FeeForwarder, donor trả phí bằng token

Relayer vẫn trả XLM nhưng FeeForwarder thu token từ user trong cùng transaction. User ký max fee, relayer chọn actual fee không vượt cap. Eager approval tự chứa `Token.approve()` trong auth tree nhưng tốn tài nguyên hơn; lazy approval rẻ hơn mỗi lần nhưng cần pre-approval và tăng trust vào FeeForwarder. [OpenZeppelin Fee Abstraction](https://docs.openzeppelin.com/stellar-contracts/fee-abstraction)

Chỉ nên dùng khi StarTip có yêu cầu kinh doanh rõ ràng để donor hoàn phí bằng USDC. Với donate nhỏ, phí swap, quote và nested approval có thể tạo UX và risk lớn hơn lợi ích.

## 6. Quy trình transaction chuẩn cho StarTip

### 6.1 Prepare, phía backend/relayer

1. Xác thực application session của donor.
2. Nạp mapping user -> C-account và verifier/signer configuration từ server-side storage.
3. Tạo intent bất biến gồm network, wallet, DonationRouter, creator, token, amount và expiry.
4. Load Sponsor G-account sequence mới nhất từ Stellar RPC.
5. Build một transaction chỉ chứa invocation đã allowlist.
6. Simulate lần đầu ở Recording Mode để lấy footprint, resource estimate, nonce và authorization tree.
7. Xác minh simulation trả đúng số auth entries, authorizer, root function, arguments và sub-invocations dự kiến.
8. Trả về auth entry/preimage cần ký cùng bản tóm tắt intent cho client.

Recording Mode chỉ ghi lại auth requirement và bỏ qua `require_auth`; vì vậy resource estimate của lần này chưa bao gồm `__check_auth`. [Transaction simulation](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation)

### 6.2 Sign, phía client

1. Decode payload chuẩn thay vì tin vào text summary.
2. So khớp network, C-account, router, creator, token, amount và expiration với màn hình xác nhận.
3. Dùng authorization digest làm WebAuthn challenge.
4. Encode WebAuthn assertion đúng ABI của smart-wallet/verifier đã pin.
5. Gửi signed auth entry kèm prepare ID, không gửi private credential.

### 6.3 Validate và submit, phía relayer

1. Load prepare record một lần, từ chối record hết hạn, đã dùng hoặc không thuộc user hiện tại.
2. Parse XDR và kiểm tra lại mọi trường, không tin XDR do client cung cấp.
3. Không cho transaction/operation source hoặc auth entry tham chiếu Sponsor theo cách khiến Sponsor authorize hành động của user.
4. Gắn signed auth entries vào invocation.
5. Dựng lại transaction bằng Sponsor G-account và sequence mới nhất nếu cần.
6. Re-simulate ở Enforcing Mode. Lần này Host chạy `__check_auth`, kiểm tra signature/policy và trả resource estimate đầy đủ.
7. Áp trần inclusion fee, resource fee, transaction size và instruction count.
8. Assemble transaction từ kết quả simulation mới nhất.
9. Ký transaction envelope bằng Sponsor key trong KMS/HSM hoặc signer service cô lập.
10. Submit qua Stellar RPC, lưu transaction hash và chuyển prepare record sang trạng thái submitted một cách atomic.
11. Poll `getTransaction` đến terminal state, sau đó đối chiếu event/result với intent.

Stellar coi Enforcing Mode là bắt buộc trước submission trong flow auth-entry; fee payer phải re-simulate để kiểm tra signature, contract failure và resource thực tế. [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)

### 6.4 State machine đề xuất

```text
created -> simulated -> awaiting_signature -> signed
       -> enforcing_simulated -> submitted -> confirmed
                                      |          |
                                      v          v
                                   rejected    failed

created/simulated/awaiting_signature/signed -> expired
```

Mỗi transition phải idempotent. `prepareId`, user ID, C-account, intent hash, nonce, expiration ledger và transaction hash cần unique constraint phù hợp để chống double submit và retry race.

## 7. Security boundaries

### 7.1 Client là môi trường không tin cậy

Backend không được tin các trường contract ID, function, token, recipient, amount, auth XDR hoặc network do client gửi. Prepare endpoint phải tự dựng canonical intent từ dữ liệu server và allowlist.

### 7.2 Sponsor key chỉ có quyền trả phí

- Không dùng Sponsor làm owner/admin của C-account.
- Không thêm Sponsor vào auth entry của donor.
- Không cho operation source tùy ý.
- Giữ Sponsor key ngoài frontend, ưu tiên KMS/HSM và rotation runbook.
- Tách relayer fee account khỏi treasury và deployment/admin accounts.

Stellar cảnh báo fee payer phải kiểm tra transaction/operation source không phải fee-payer và auth entries không tham chiếu fee-payer trước khi ký. [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)

### 7.3 Relayer allowlist và quota

Tối thiểu cần:

- Network passphrase allowlist.
- Wallet Wasm hash và verifier deployment allowlist.
- DonationRouter contract ID và function allowlist.
- Token contract allowlist.
- Amount, fee, resource và TTL/rent cap.
- Quota theo user, wallet, IP/device risk, creator và time window.
- Rate limit cho prepare lẫn submit.
- Circuit breaker theo số lỗi, số XLM tiêu thụ và Sponsor balance.
- Không cho arbitrary Wasm upload, deploy, restore hoặc extend TTL qua donate endpoint.

### 7.4 Simulation không thay thế validation

Simulation chứng minh transaction có khả năng chạy trên ledger snapshot, không chứng minh intent phù hợp chính sách StarTip. Relayer phải vừa validate cấu trúc, vừa Enforcing Mode simulate. OpenZeppelin cũng yêu cầu relayer đánh giá target call, fee collection và outcome trước submission. [Fee abstraction security considerations](https://docs.openzeppelin.com/stellar-contracts/fee-abstraction#security-considerations)

### 7.5 Replay và race

- Expiration ledger ngắn.
- Một prepare ID chỉ được submit một lần.
- Không tái sử dụng auth entry cho intent khác.
- Atomic claim trước khi submit.
- Rebuild với sequence mới nếu transaction hết hạn, nhưng phải xin chữ ký auth mới nếu invocation/expiration thay đổi.
- Dùng nhiều channel accounts hoặc sequence lane có lock khi cần concurrency.

### 7.6 Upgrade và deployment integrity

- Pin source tag/commit, crate version, Wasm hash và deployed contract ID theo network.
- Verify deployed Wasm trước khi cho wallet giữ tài sản thật.
- Tách quyền upgrade khỏi daily passkey rule, dùng multisig và timelock cho upgrade.
- Mọi upgrade phải có storage migration test, auth regression test và rollback/incident plan.
- Nếu chọn verifier dùng chung, ưu tiên immutable deployment và xác minh chính xác address.

## 8. Khả năng mở rộng của smart wallet

### 8.1 Payment guard

Đây là extension nên làm đầu tiên:

- Chỉ donate qua DonationRouter.
- Chỉ dùng token được hỗ trợ.
- Giới hạn theo giao dịch và theo ngày.
- High-value donation cần thêm signer hoặc threshold cao hơn.

Stellar hướng dẫn triển khai spend limit, allowlist, policy signer và time rule trực tiếp trong `__check_auth` hoặc helper. [Advanced contract account patterns](https://developers.stellar.org/docs/build/guides/contract-accounts/advanced-patterns)

### 8.2 Session key

Tạo key ngắn hạn cho một livestream, chỉ cho phép function, creator, token, amount cap và expiry cụ thể. Session phải bị từ chối nếu hết hạn, hết allowance hoặc gọi ngoài scope. Không dùng bearer session vô hạn và không lưu private session key trong storage dễ bị trích xuất.

### 8.3 Recovery và thiết bị

Recovery không tự xuất hiện chỉ vì dùng passkey. Account contract phải định nghĩa rõ:

- Thêm và thu hồi passkey.
- Guardian hoặc recovery signer riêng.
- Threshold cho key rotation.
- Delay/cooldown trước thay đổi nhạy cảm.
- Emergency freeze và notification off-chain.
- Quy trình khi mất toàn bộ thiết bị.

Daily spending rule và recovery/admin rule phải là các context khác nhau. Recovery không được dùng một server key duy nhất của StarTip, nếu không wallet trở thành custodial trên thực tế.

### 8.4 Multisig, recurring và agent delegation

OpenZeppelin smart-account framework tách:

- Context rules: scope và lifetime.
- Signers/verifiers: ai chứng minh quyền.
- Policies: threshold, spending limit và time constraints.

Framework hỗ trợ delegated G/C-account signers, external signer verifiers, simple/weighted threshold và spending-limit policies. [OpenZeppelin Smart Accounts](https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account), [Policies](https://docs.openzeppelin.com/stellar-contracts/accounts/policies)

Từ đó StarTip có thể xây:

- Recurring creator support với allowance theo tháng và quyền hủy.
- Team/treasury wallet với weighted multisig.
- Agent signer chỉ được donate số nhỏ cho allowlist creator.
- Device key cho daily action, passkey/guardian cho high-risk action.

Cảnh báo của OpenZeppelin: threshold policy không tự cập nhật khi signer set thay đổi. Thêm signer mà không tăng threshold có thể làm yếu policy; xóa signer có thể khiến threshold không bao giờ đạt được. Hai thay đổi phải được kiểm tra và, nếu có thể, thực hiện atomic. [OpenZeppelin Policies](https://docs.openzeppelin.com/stellar-contracts/accounts/policies)

## 9. OpenZeppelin smart-account framework

Framework hiện dùng `AuthPayload` chứa signer map và `context_rule_ids`, một rule ID cho mỗi auth context. Rule IDs được hash cùng signature payload để chống đổi sang rule yếu hơn sau khi user ký. [OpenZeppelin authorization flow](https://docs.openzeppelin.com/stellar-contracts/accounts/authorization-flow)

Điểm mạnh:

- Module hóa signer, verifier và policy.
- Tái sử dụng verifier contract cho nhiều account.
- Có simple threshold, weighted threshold và spending limit.
- Hỗ trợ rule theo contract/function context và lifetime.
- Tách daily rule khỏi admin/recovery rule.

Điểm cần lưu ý:

- Client phải biết đúng `context_rule_ids`, không có auto-discovery.
- Delegated signer hiện có thể cần tự dựng auth entry bổ sung vì simulation không tự trả entry phát sinh từ `require_auth_for_args` bên trong `__check_auth`.
- OpenZeppelin nêu đây là hạn chế có thể được cải thiện bởi protocol changes tương lai, do đó client ABI và flow chưa nên coi là bất biến. [Signers and Verifiers](https://docs.openzeppelin.com/stellar-contracts/accounts/signers-and-verifiers)
- Audit RC v0.7.0 có các finding và một số mục được acknowledge thay vì sửa. Phải đọc audit đúng phiên bản, pin release, không lấy `main`, và xác nhận phạm vi audit bao phủ các package/Wasm thực sự deploy. [OpenZeppelin Stellar Contracts RC v0.7.0 audit](https://www.openzeppelin.com/news/stellar-contracts-rc-v0.7.0-audit)

## 10. Trạng thái ổn định và phần cần theo dõi

### Primitive đủ ổn định để thiết kế dựa vào

- Soroban `require_auth` và `CustomAccountInterface::__check_auth`.
- Address credentials với nonce, expiration ledger và invocation tree.
- P-256/secp256r1 host verification từ Protocol 21.
- G-account transaction source trả XLM cho C-account auth-entry flow.
- Recording Mode và Enforcing Mode simulation.
- Fee-bump transaction protocol.

### Tooling hoặc API phải pin và kiểm thử lại

- OpenZeppelin Stellar smart-account ABI, package versions, verifier contracts và deployed addresses.
- OpenZeppelin Relayer/Channels APIs. Dùng docs stable `v1.5.x`; trang development ghi Stellar còn partial support.
- Soroban FeeForwarder và token fee abstraction, vì nó thêm external contract, DEX/swap configuration và approval semantics.
- Delegated signer client flow, do simulation hiện thiếu nested auth entry tự động.
- Bất kỳ SDK wrapper nào che khuất raw auth entry hoặc tự quyết định expiration/resource buffer.

Trước mỗi mainnet release, xác minh lại:

- Target network protocol version.
- `@stellar/stellar-sdk` version và API signing/assembly.
- OpenZeppelin release tag, audit report, Wasm hash và deployment address.
- RPC provider support cho simulation và submission.
- Relayer stable version và Stellar-specific limitations.

## 11. Hiện trạng và quyết định cho StarTip

### Hiện trạng repository

- [`DonationRouter.donate`](../contracts/donation-router/src/lib.rs) nhận donor
  dưới dạng Soroban `Address`, gọi `donor.require_auth()` và dùng donor làm nguồn
  của các SAC transfer. Vì vậy cùng một entrypoint có thể nhận authorization từ
  G-account hoặc C-account.
- `DonationReceived` hiện phát thông tin settlement nhưng chưa chứa donor
  address. Trong sponsored flow, transaction source là Sponsor nên indexer
  không được dùng envelope source làm donor. Nếu sản phẩm cần donor C-account,
  phải thêm field này vào contract event và cập nhật decoder/indexer.
- `@stellar/stellar-sdk` đang được pin ở major version 16 trong web, Worker và
  shared package. Mọi ví dụ SDK trong tài liệu chính thức phải được đối chiếu
  với đúng version đang cài trước khi sao chép API.
- Sponsored wallet routes đang được phát triển trên một nhánh tích hợp riêng và
  chưa nằm trong working tree hiện tại. Prototype này dùng Passkey Kit ABI cũ
  và phải được chuyển sang Smart Account Kit trước khi merge. Flow chỉ được coi
  là hoàn thành sau khi chạy E2E testnet và chứng minh auth entry thật bằng
  transaction hash.

### So sánh Passkey Kit và Smart Account Kit

Thông tin dưới đây được đối chiếu với trạng thái repository ngày 2026-07-22.
Passkey Kit đang hoạt động và không phải repository legacy. README hiện mô tả
Smart Account Kit là một sibling SDK dùng mô hình authorization khác, đồng thời
nói rõ hai kit không tương thích theo kiểu thay package trực tiếp.

| Tiêu chí | Passkey Kit | Smart Account Kit |
| --- | --- | --- |
| Phiên bản repository | `0.14.0`, có GitHub release `v0.13.1` | `0.4.2`, chưa có GitHub release/tag |
| Nền tảng contract | Smart-wallet contract riêng của Passkey Kit | OpenZeppelin `stellar-contracts` smart account |
| Mô hình auth | Flat `Signatures` map, signer limits theo contract và co-signer | Context rules + auth digest + signer/policy |
| Signer | Passkey P-256, Ed25519, policy contract | Passkey, Ed25519, delegated G-account |
| Policy | Có policy signer và sample rolling spending allowance, nhưng app phải tự thiết kế policy composition | Threshold, weighted threshold và spending limit có typed client |
| Sponsor transaction | `PasskeyServer` và OpenZeppelin Channels | Relayer client/proxy cho sponsored submission |
| Phù hợp nhất | Passkey wallet đơn giản, flow hẹp, tích hợp nhanh | Permission chi tiết, recovery, multisig và payment guard dài hạn |
| Rủi ro chính | Contract chỉ có internal adversarial review, chưa có third-party security review; `0.14.0` đổi canonical Wasm và có breaking API | SDK còn trẻ, pre-1.0 và đã có breaking migration; policy state cần được đồng bộ cẩn thận khi đổi signer |

[Passkey Kit README](https://github.com/kalepail/passkey-kit/blob/main/README.md)
ghi rõ contract dùng flat `Signatures` map, hỗ trợ fee-sponsored submission và
không drop-in compatible với Smart Account Kit. Changelog `0.14.0` cũng đổi
canonical testnet Wasm hash và `updateSecp256r1` API, vì vậy nâng version giữa
tuần hackathon có thể làm lệch ABI mà StarTip đã pin. Repository cảnh báo người
dùng tự review trước khi giữ tài sản đáng kể; changelog xác nhận contract mới
chỉ được internal adversarial review, chưa được security firm độc lập review.
[Passkey Kit changelog](https://github.com/kalepail/passkey-kit/blob/main/CHANGELOG.md)

[Smart Account Kit README](https://github.com/kalepail/smart-account-kit/blob/main/README.md)
dùng OpenZeppelin smart account với ba context chính: mặc định, gọi một contract
cụ thể và tạo contract theo Wasm hash. Auth digest bind chữ ký với các rule ID,
giảm nguy cơ chuyển chữ ký sang rule yếu hơn. Threshold, weighted threshold và
spending limit phù hợp trực tiếp với payment guard, guardian recovery và session
permission mà StarTip muốn mở rộng.

Audit của OpenZeppelin là điểm cộng nhưng không được diễn giải thành toàn bộ
Smart Account Kit đã được audit. Phạm vi audit chỉ có giá trị với đúng commit,
module và Wasm được nêu trong report; code tích hợp, relayer, cấu hình policy và
migration của StarTip vẫn cần review riêng. [OpenZeppelin Stellar Contracts RC
v0.7.0 audit](https://www.openzeppelin.com/news/stellar-contracts-rc-v0.7.0-audit)

### Lựa chọn cho StarTip

**Quyết định: StarTip sử dụng Smart Account Kit làm smart-wallet framework
chính từ v0.3.0.** Passkey Kit chỉ còn là tài liệu so sánh và nguồn tham khảo
cho prototype cũ, không tiếp tục phát triển thành một wallet path song song.

Trong 7 ngày, phạm vi Smart Account Kit vẫn phải giữ hẹp: một passkey signer,
một C-account, một default hoặc DonationRouter-specific context rule, một SAC
asset và một Sponsor G-account. Spending-limit, recovery, multisig và session
authorization dùng cùng kiến trúc nhưng chưa trở thành điều kiện hoàn thành bản
hackathon.

StarTip pin `smart-account-kit@0.4.2`, OpenZeppelin upstream commit
`1e513890ecf79833c9d6e7ef38a9358001c0b111`, Protocol 27 smart-account Wasm
hash `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a`
và testnet WebAuthn verifier
`CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F`. Các giá trị
này phải được đọc từ cấu hình theo network và đối chiếu với
[deployment manifest chính thức](https://github.com/kalepail/smart-account-kit/blob/main/docs/deployments-protocol-27-2026-07-09.md), không rải literal trong client.

Việc chuyển prototype Passkey Kit hiện có sang Smart Account Kit là migration
authorization model, không phải thay package. ABI flat `Signatures` và proof
encoder cũ phải được thay bằng context rules, auth digest và verifier payload
của Smart Account Kit. Migration phải chứng minh:

- Passkey registration và authentication trên đúng Protocol 27 deployment.
- DonationRouter `require_auth()` nhận đúng auth tree và context rule.
- Sponsor relayer không có quyền chi tiêu tài sản của C-account.
- Spending limit, signer rotation, recovery và policy update đều có allow/deny tests.
- Exact package version, OpenZeppelin commit, Wasm hash, verifier và policy
  addresses khớp với phạm vi audit được chấp nhận.
- Prototype wallet cũ không được mặc định giữ nguyên địa chỉ hoặc signer state;
  testnet data có thể được tạo lại cho release mới.

Không duy trì đồng thời Passkey Kit và Smart Account Kit trong production.
Không tự viết smart-account contract mới khi OpenZeppelin model đã biểu đạt
được yêu cầu, vì điều đó mở rộng mạnh security surface giữ tài sản.

### Quyết định theo phiên bản

- v0.3.0: Smart Account Kit đã pin, một passkey context rule và sponsored
  DonationRouter donation E2E trên testnet.
- v0.4.0: mở rộng Smart Account Kit với payment guard, signer rotation,
  recovery và policy management.
- Mainnet: chỉ phát hành sau khi pin toàn bộ supply chain và deployment, xác
  minh audit coverage, hoàn thiện recovery, monitoring, incident response và
  wallet migration strategy.

## 12. Khuyến nghị tích hợp theo giai đoạn

### Phase 1: sponsored passkey donation tối thiểu

- Một C-account implementation và WebAuthn verifier đã pin.
- Một passkey signer cho daily donation.
- Sponsor G-account riêng trong signer service.
- Prepare/sign/submit flow với Recording và Enforcing simulation.
- Allowlist tuyệt đối cho DonationRouter, donate function và token contracts.
- Max amount, max fee, expiry, rate limit, idempotency và audit log.
- Testnet E2E bao gồm success, user cancel, bad signature, expired auth, modified amount, modified creator, nested-call injection, duplicate submit và Sponsor sequence race.

### Phase 2: payment guard và recovery

- Per-tip và daily spending limits.
- Rule riêng cho wallet administration.
- Thêm/thu hồi passkey.
- Guardian multisig và recovery delay.
- Emergency pause cùng notification.

### Phase 3: session và automation

- Session key theo livestream.
- Creator/token/function scope.
- Remaining allowance và expiry.
- Recurring support có quyền hủy.
- Agent delegation với cap rất nhỏ.

### Phase 4: relayer scale hoặc fee abstraction

- Chuyển sang OpenZeppelin Relayer/Channels nếu concurrency và ops overhead biện minh cho việc này.
- Chỉ thêm FeeForwarder nếu StarTip muốn donor trả phí bằng token.
- Không gộp fee abstraction vào Phase 1 vì sponsored UX không cần nó.

## 13. Tiêu chí trước khi triển khai mainnet

- Wallet contract ABI, source tag, Wasm hash và contract ID được pin.
- Verifier ABI, Wasm hash và contract ID được pin.
- Passkey challenge được xác minh bằng auth digest thật.
- Root và toàn bộ sub-invocation được kiểm tra trong policy lẫn relayer.
- Enforcing Mode simulation chạy sau khi gắn chữ ký.
- Amount, resource fee, inclusion fee, rent và TTL operation đều có trần.
- Sponsor key nằm trong KMS/HSM hoặc signer service cô lập.
- Sponsor không phải wallet owner, signer hoặc contract admin.
- Idempotency, atomic submission claim và sequence strategy đã load test.
- Recovery và signer rotation đã test cả allow path lẫn deny path.
- Audit đúng release bao phủ code thực tế được deploy.
- Monitoring và incident runbook bao phủ Sponsor drain, key compromise và
  smart-wallet contract bug.

## 14. Nguồn tham khảo chính

### Stellar

- [Smart wallets](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Advanced contract account patterns](https://developers.stellar.org/docs/build/guides/contract-accounts/advanced-patterns)
- [Smart contract authorization starter guide](https://developers.stellar.org/docs/build/guides/auth/contract-authorization)
- [Authorization fundamentals](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
- [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)
- [Transaction simulation](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation)
- [Soroban transaction structure](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction)
- [Fee-bump transactions](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)
- [CAP-0051: secp256r1 host functions](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0051.md)
- [JavaScript SDK repository](https://github.com/stellar/js-stellar-sdk)
- [Soroban Rust SDK repository](https://github.com/stellar/rs-soroban-sdk)

### Smart-wallet SDK

- [Passkey Kit repository](https://github.com/kalepail/passkey-kit)
- [Passkey Kit README và caveats](https://github.com/kalepail/passkey-kit/blob/main/README.md#caveats)
- [Passkey Kit changelog](https://github.com/kalepail/passkey-kit/blob/main/CHANGELOG.md)
- [Passkey Kit canonical testnet deployments](https://github.com/kalepail/passkey-kit/blob/main/docs/deployments-testnet-2026-07-11.md)
- [Smart Account Kit repository](https://github.com/kalepail/smart-account-kit)
- [Smart Account Kit README](https://github.com/kalepail/smart-account-kit/blob/main/README.md)
- [Smart Account Kit changelog](https://github.com/kalepail/smart-account-kit/blob/main/CHANGELOG.md)
- [Smart Account Kit Protocol 27 deployments](https://github.com/kalepail/smart-account-kit/blob/main/docs/deployments-protocol-27-2026-07-09.md)
- [Smart Account Kit v0.4 migration guide](https://github.com/kalepail/smart-account-kit/blob/main/docs/migration-v0.4.0.md)

### OpenZeppelin

- [Stellar Contracts overview](https://docs.openzeppelin.com/stellar-contracts)
- [Smart Accounts](https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account)
- [Authorization Flow](https://docs.openzeppelin.com/stellar-contracts/accounts/authorization-flow)
- [Signers and Verifiers](https://docs.openzeppelin.com/stellar-contracts/accounts/signers-and-verifiers)
- [Policies](https://docs.openzeppelin.com/stellar-contracts/accounts/policies)
- [Fee Abstraction](https://docs.openzeppelin.com/stellar-contracts/fee-abstraction)
- [Stellar Contracts repository](https://github.com/OpenZeppelin/stellar-contracts)
- [Stellar Contracts RC v0.7.0 audit](https://www.openzeppelin.com/news/stellar-contracts-rc-v0.7.0-audit)
- [OpenZeppelin Relayer stable documentation](https://docs.openzeppelin.com/relayer/1.5.x)
- [Stellar sponsored transactions guide](https://docs.openzeppelin.com/relayer/1.5.x/guides/stellar-sponsored-transactions-guide)
- [Channels plugin](https://docs.openzeppelin.com/relayer/1.5.x/plugins/channels)
- [OpenZeppelin Relayer repository](https://github.com/OpenZeppelin/openzeppelin-relayer)
