import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Product, StorePrices } from "../types/products";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IKI tinklo (chain) ID LastMile sistemoje:
const IKI_CHAIN_ID = "CvKfTzV4TN5U8BTMF1Hl";

const API_URL = "https://searchservice-952707942140.europe-north1.run.app/v1/frontend-products";

// Kategorijų grupės kartu su jų pavadinimais (kad failai vadintųsi gražiai)
const IKI_CATEGORY_GROUPS: { name: string; ids: string[] }[] = [
  {
    name: "Vaisiai, daržovės ir gėlės",
    ids: ["Y5C805FzmW137oeYY1to", "fAh2docYiH9UX5MgmSE7"]
  },
  {
    name: "Kepiniai ir desertai",
    ids: ["NvWyUkOKd2QvEUuh5yka", "4ZGtSS9jcVJkP47tQRDE", "tw8J7pns96A6acQaqlvM", "qkks0EO4QQj9IPThP0kR"]
  },
  {
    name: "Mėsa, žuvis ir kulinarija",
    ids: ["pSp7CyeVom1sAZvZc7EI", "XVeQPP80StGshwXWvtqX", "GpxRLLOJQhwXT1gRv31B", "sJWkvs1lt4ZZ2PGLlA1Y", "uZdfbOYrBrpG35kvAifS", "F8PZrmtKmXIIf1n0s6U7", "UECjX7WiDLIMN1QWjGuz", "d0sSboZtct4fnb7Hkr6L", "ETfubg9f4Ot4Y7iJIMQF", "T0npf6xRpCJAvdnhDbu9", "f4sDbO3zekCiMcKyrVXC", "RvDhx7qVrrNXtTLtDdjV", "h1VYkr4dQtm72qmpA6jx", "7tnBfI0Svh0JoP4fLDtx", "4bhoxwJdhOoh9ODYpruP", "FHVfo0NRSaYjmrai25IJ", "BRX6UmvIQlFmd8a4NjCy", "gHrsyFchhgIim0aINZIJ", "x94S4dIO7QlNkQTLw8iW", "2nXGISeF7mSZHwz4p5U9", "3EURcmHT8b3wAG0etozD", "irs5U3S7jM5oGCzhpFvK"]
  },
  {
    name: "Pieno produktai ir kiaušiniai",
    ids: ["zmmovsyGLwTxPGq5k5Je", "OOXkM31IsMQITBpMRKCc", "f2DAjDHGo5cnG4OwWl9k", "2rdjzmKnq2hYXM8mmmtt", "lVSlG0kKAJoYQ8LRO6gS", "vT0ZobBsjGysNrV9ucHd", "LtobpziJ8OFjtm0PkqK8", "NzZUKv0FqvRk7H75rG2H", "z2v9LOP3zNYSMyt7JXPB", "zj41KfNFw00DUsmAmuLT", "AOaXQwEdGuA3lCFxVE9K", "4oamCLRRf6zXk1nJQvkN", "COynqOZDsEIkh5MGTB3w", "xkAe6r7nKIvLJTpTrlGT", "Ec6bhRx5iHyA9eaVuSgF", "DDKeElqZGQCD0mXP180j", "4tb5TMz79bNjFE5Ia0xe", "0aZx0nyFtxYs8gQE1ETk", "LNqYuP6Xe8MqwvcVLnnv", "IAzfy2vMiL4BT7au0afa", "I91DTryaHj3j3j0yDFdI", "kgqMoQZCRFozAGcXDVSh", "YIFaKQUNmdUxxiYkbKV7", "3oyV4kGwwg4gLtRryJze", "BNoD6WIqwxCVzyiQd4Hx", "T9qTOvsgOWzhS3qFiynm", "C9H2i83EBAxOuCz91WNN", "gDRUoDfrq3OIlKMbaxAL", "FFSlaLTD20JsoggMoTVA", "dyCl0o5IrNIiZLh0aLdF", "WKj2DyrfsHGswAPeZ4Ca", "nxjfpBk8PjYUw9WoxDUI", "jTUXCiIDOKce4LcgPuuf", "KNeK9m1ByShovXjIxeSv", "bCzPFmrqIUyt6L0Zkx9B", "FVBJnZImPh6XaVsZt5cR", "2nl7HQCKQTCErHpcCqXm", "LTDbwgDxQNUZCsJq0gzV", "G6UHTxJYYt3PsSP0zLUx", "O0VVAibYbyexBxrPuOcZ", "DzRK2HsWmLXN3c6G2NY9", "UecS15WT6c6oKb6ycGeG", "TnhQpqFQ4iWqsjKZBbP6", "QlCPgewLGjxXiKgK618k", "UqTzRTWRYMqwuZ2FQSZw", "OWjD9aPQ8NGm2LANLvCm", "REh6WfXoW2y62L1phJPp", "LvY6ZVOYbctVAFQcjvHI", "LNmUtkF3Y27vOehBZDz6", "jCxGSUU07HtiuoxQffPP", "FIP0AmFHIUc3kTrwRa6j", "yXmNnBh9kQrlYiijpxES", "RT77bnsFJoMF0cHz4tHk", "0jU3THWiNAGxpWPR59Yx", "JXUaqADrKQzjv28GA5Pr", "CvTru6hbXoNI366n6RuF", "rOsh2aFX6S8ixz26iET1", "twZQd6K0fUV6JGVsy0VX", "LTmLYXqlyXiKPopcLbo2", "BGmxoPpvh1rmzVAQb6rR", "ZPu34X3NiGosL8ja65DL", "pJVHlBf5hmNmXNEgJaW9", "IpbP4jJ6oApco9y7mHZr", "mlgJRhkPViL6inwVWz8v", "nIjbLAtDiPV2h69jmYIN", "cFkxXrf3DahHriNXY7lB", "tIKbONJT3Mt4lMwgHxyA", "nOaQgYDpIJiJKd3kDDfI", "0isyjjjnImLTypnbyWwq", "aPjmL2UY42BVVEtjcw4L", "pyVWKTD8IlsrgEdwUUmw", "7CG9FuWhfyafGL1meoeA", "CNvAL4uYWohyfK7z9v8m", "HQ0ncIQj7NDr1xmFxVL3", "axsJ9QcxvXUPPnkda2R8"]
  },
  {
    name: "Saldumynai, užkandžiai ir kavos",
    ids: ["xbgrVqHO9vcq5KUoeGPV", "fTpM3IdOaLWI84gtYPSb", "O08m3WVblZclMcjLithb", "QVhYfFsdLdkeuh6xtBNl", "wTJtFBsOEkXHjG5xfxXi", "ikWWbOhKHAtvGj5Cs0jh", "ySPTfFQZwDIWC2WwvyGM", "iNPAuzBw1O9mfL7WAFK2", "gFWFPUU1Mr28yhfZCuTV", "Bm1T7SW6uauLu3Cewl5C", "Hgxlk7zIS5BRXniyPJia", "9z27voHaCKdRWyeVelvG", "mrYsKDB0xEsy6mWYiiLz", "V0hQPjhelobFpTvt0xBp", "3ihxbAMYDpc7QD485C25", "mv1dDe7MeMdlxQYATW56", "BOAgiumLnB6LipJVTlcP", "rOjc5Dk5KQI47XRy9WIq", "I77LjH7S9OM0vsjWO6bx", "qi2oiNhoMdKmha77Pyjc", "AgwvlzaE6kjIGE7dYhTY", "NmFbuLWKVKLDCkJ2ao82", "wpUUJ5ZJ7puklQRZn3sd", "Jko8wkZMGzaWtIKmIgbi", "bXc72jPvtGzyDu3Yu5HS", "CcVBzRkP5g8yJL2wLFxc", "hge56OFAUdfHUHPktTpG", "e8MtD0cirXtfiVetDR7S", "Yy8mBh2jhGbq7BKYM0RD", "t7fPdt6kkEOAScZ1I8eQ", "j7sdIXMKnVipgAqfik6M", "8UGnWG3M56QVlNIW3yIp", "DjRXchBTIMVixQgJzwvF"]
  },
  {
    name: "Bakalėja ir paruoštas maistas",
    ids: ["4sC3DImX7K7Uo496jjQH", "OP2Ob2poCnpn9Iz6djp8", "ioNuNkGcriijZ07unN71", "K0l00EhSlyw690OZL62P", "eE9yUlVuAAbBkO4iqfTi", "N8UXQBNb5JPRvWmrdoD1", "avM3J7llWH5TJ3okoQZ2", "zxnDmeLhQGelnhdo5So9", "I4tA0clcKZkF4JmzOnnC", "wkbR31hwcXeiCqOGsL32", "zz6bAE3PfeqymFIBTYB0", "rkuoRLkxQotEllUKlywf", "6pZcUXiL1VkJYeds8hHE", "nteUX5Ar6UHGIcZrerzt", "il9R2BGs3RT2MjHqz7Gj", "El7f2juUtbenxmIsQHJa", "rFv6yr0oLKKQqsSi6Ivy", "E2XYovDtWIxabVr960UC", "nNF5yk95xyKzgFF1Wt1f", "1RRqo7gdWVx0GqACHVSM", "DIMX5bZL3fqPIRL7W5KY", "f4HRwM01qEd8SXHi7YVd", "sLIrfwwN7cx2pYeJvWfC", "lN1KCxxbu7zvOyCc2N0a", "2N5IOgDtrDD5lDdbJtnE", "Zc8EytsvFSBanUQMSqG0", "DQCDDrnix9U1yRLhQSoF", "GbwQKkDbPgXUVyZEOjEz", "QnR00DrO5Y9Qu8UoZLG6", "XWMYKIX1P4DKzXrZeh4A", "VoQlDoAIsBZ5050mdRAr", "uYiycslynpAfEv7H2LqI", "MTQry6cJFLC5yEHvm6xR", "0c8Ghfvn50v4ASga119J", "mGTavP2kHPOliLDRN4Ho", "I7OPeeMN4WEOX2DG9ZU2", "MkxML3YaclVqXMjXJTig", "fY2QZXRDJ29YnVYwbeBn", "Zf3IkbC1OtiAfVcBleIf", "DVq0bs6fzi37mvzlFIYk", "Ntn59RTNoJfAoCU1cJYM", "OPHeuvOJpt1bpwJfRWfc", "o9czxXbwGp0wgKf0HqKT", "sd88OPMB6XJoFM1Q7ycC", "Tycbu2tU8DN8fsFIuPoY", "k49INE8oIqtbdvXgW31c", "XeHth4sRzs4aDBWIpU8c", "AlSwG5JoSOvCbmE344A3", "Vsdo3rNMvy4ml6B5Ln5U", "hPGiA2CSlQyFwv9SLEDg", "pAHTvnCb1Xl72HglJKVN", "DkE7OsNR1p1rlrDMWX4D", "JO12a1tV4SFqzhmujTA1", "2rxHdKg07MU8fkg1qqb0", "SO66oizaTy4uCb4PJGjt", "4cLzSeLUdDnnmRqbfhu9"]
  },
  {
    name: "Šaldyti produktai",
    ids: ["TJ6NhYDkCPLGjcRTqZjK", "M8dL1bh1WadwmfZ09A4V", "kz2TT7dge3lpK2vedppN", "CuXspGeBiov64vp4EiQK"]
  },
  {
    name: "Gėrimai ir alus",
    ids: ["9scLMmNQKx51gea2NVAa", "FGd6TsgWB0j6c8d1d6gw", "T60naLPlPObdJ3Og0fQn", "FXSsveyzHYxsCWFrcN9C", "bKGR6DFHjP619GdRzPWS", "LtbQGkuJwPiDnmVB6pVv", "BkTNWqeKE1jiuDtPsWSW", "qbNCX0aL83HzgzCsya9A", "JLEPwNlTJSoU04SuiTWo", "vprCZ3DEa3BUkCUqo42C", "Ohgt1XviCgQgEGNpKnvA", "F6QMTJIMTtR8pd0IXKJT", "FnCRepdlXWcPFc7jSxsR", "vqQFZHec9MKqo27197nG", "H5weIwTzd15oYgL3gnuD", "ZJmFLQ0kNPbvcxYH0dcG", "InNmgknHaTH2HnyMyQqn", "bXJUVgMdRwyBpjxHkwv4", "2xQtOLNXdCH5QtVzJzUD", "RxuWSLdcCJvO4rk7l7rJ", "g27lOtQgRSvsCMwc7nrJ", "efQbL3vloL2InRCRubKD", "B9mBOA8fTJSS46PIYAiz", "Ua54Dd7Zb0nYDlqqV6Vn", "QXWVomV5Huk77udKFbwD"]
  },
  {
    name: "Namai, laisvalaikis ir gyvūnai",
    ids: ["mhYlBiDnAiZgRwSXij2y", "cz6q3USaair01xrpebtg", "hwNbuIfryUJtHlzFyRoK", "GNG3fDoP6pghcYkeAoZJ", "ByhMI7PCeuXLZJ565KaD", "fHdd3b3wVRYuaDQXyGtN", "XaUg9ucefqu3aRS8Qp6a", "W50J3lC4gXlWjsnorkdv", "VGBhRYS6rcbgV0gLkwlS", "gB8OOBnAmUzvJybHaX4B", "jRjC03haLbmE9ikWU7s0", "x5D0qKvlKufvGwuNi6fU", "7QV8tjymgssUqJLjhHae", "AVX8wz1kuMCM8uoI8IJ1", "RFK2y5XXmhgSgGnHyMFW", "j1LaMRUI60lbWabxTDys", "iZ9y6PeZmoulvasT9N9C", "vrypvblEpRysHN9QaSOw", "aKUQsbpxqpSvyUBdskvu", "l84FgzHxgaIYhf4RNI3w", "gLo3RueFcrDOZbSdRmQg", "L8vn0b5JHra7t1Q5Ow5b", "4AfprxwQtrTasTaYbgxw", "x8RwW2VkfWoJzP9NWJkb", "EMFdsS2Bl7OjDlf22uIS", "Zdw5TlWiX2f4nBMzLYtW", "eBpmNAQC5T7JKEU2v6lP", "wUA0cJ7rbtG0fCdsibAo", "YLRUPplw5LFnqALa7E9m", "CwGJFATwDMJCCH6MMwOT", "KyiXze4xIrOiYJBhphre", "uElOR7oE68jaeFHKispL", "EF4uROccePS8Hm0Z2c6R", "JVsnXbn0ltuD1RC6PcdU", "HrVXUelXvGtcwsgPENte", "SQHcnZwpn9FenKIKabze", "QzqJCd1BY8WsP2cIEjfn", "pp6Avzk2lJdd2CZz8CV9", "VYX0bBE7ArS3MZJBcWEk", "eu4YqNOvaXZ8y2Vm4DyC", "LTdG8Zt10Ma1GznYf6J3", "Rg8p6xGvZNQQREd8MWq8", "smSUbLVT9QCKtK5KG8Nb", "GQ5pWZb2xpV4hNyA9TQT", "RjemQBMjPmdV3WtWeEGe", "BXKrgKA9GZ2yw7frSzuT", "PLZeNGAG273IJKK7jj8q", "bGgkKlEImgdVsuEPh4Lz", "rf7YV9ThmoHM0SVxrYWU", "HfNaitu4ar5XuZnGGuhX", "85VnkfVJ9nRS3rQS2d12", "ORStTB7FXN0XDUDkNDO5", "Udmh5Xsk7LccKPe0GLm9", "LDdZQJuRwI9NRNkdmvz0", "9IPHCXd9IoLII0O5VaI6", "25OgDbfGmU0uhyDsHK0I", "6s9qSLIUpHI5qFd8TCY5", "RRbxmmoxrGi4xfzJo9xB", "VA9G1SHFdy82rsasgsgu", "CMaRhbwrHGRZ7RVU9KrL", "GD4K3UGWTH3UZkSD7U1P", "5bOl3l2McywMwRcUlAWn", "w8dCwMdYhdDGRUwekSRg", "v0R16IUiQqmGB29MmOeJ", "ABor43WKVSrdlCbncZDu", "6i5prKUknKSYCq3ttZV8", "g6Ijgnx2VKOxDCszzWhb", "csHGNBdHFJ91xRUaYoq3", "40fmJwOVFE4lA2x56k4T", "LMpxW3n6ekgN7pmkOt38", "kpgp1qbxzheYcWC76J8v", "yxn0GIwnwLZANHNUKCCS", "2Er6uCoF2qg2Nf6tlisB", "f1HYgbC1fPJUzF3skzbm", "YILWeHctvG4K5lTvKuZ2", "xrpBikSuOtxvZX09kMfC", "Qj3Xq0fzKI03db0NbDfg", "QkvvglX4465zyqG7TKsm", "JFtpzDkuplvzUr0X58Oe", "zl9ZmxcEosAR8dJfnGZS", "K2Z4AudSiRn3FuBkwHfy", "Qf9MppS1q3RaNhue4aO1", "AQMt1Gu02R6vYWUUZqo7", "oWIQ9DXVOzpI6PH2SzJS", "pnmkbZ5VdnT5Yti8lDR8", "SMGCYvi0gjyAfQqdYUJs", "a9zYRsYYEJqUuc5uZgqp", "KsYGXMJTKsJMDSO9FpmB", "vcUI5suy4bWk2E2MqKaC", "3IXv8O3Xai6pM8DdNTBG", "7U7Y81IM1xscp2KbfjL9", "fz9sRoq4jsw3kWhjbkbE", "inUEq681Ta79a7q2vi3o", "2ApCpGnvmGRFn4ly11gQ", "QCJwzQF4HUG2tbaKzGq0", "ftKG5THoJIny4D6uEdw5", "3lZeFywVjWyoWmIphzs1", "n2O6IzzkykJG2SfaJOqh", "PsXALELJJnZIU4ZM269F", "W6F4bqA8PemXLkv6nb3O", "ODqHr8vfjl8DztiGhBgf", "oizKUuCoBHF7YZ9VLcR4", "yUldBpfTe3GKV8tIdT5m", "gPUX0CBModJ5v7M3xD7l", "AHkVHnpPs99e1M3MxyIZ", "HpOq6PRDxCGNb4Gwuccr", "GMpJOAefe6Ji8MZWXp8Q", "t6fba6v3e1G2rZxbFta9", "e23fNxYB5ab3c1w5khoq", "Rck7Y4OyPKkjVsgUksx5", "6tncKVXJkd7vBtCrMgaY", "7CArFvTWuxbnOQli0GK7", "02N1oTBSX7ymLsFzTfub", "QQnLH0qXhizFcMNub79b", "UHU1W66s44Bf6LzY4lVJ", "cGk6iS4ns87zpWuB9rTD", "gHaQ5U94aSarEe7XBKWx"]
  },
  {
    name: "Grožis ir higiena",
    ids: ["PqcVdHfDtnnYFQo88uKj", "Bw910h8EeBws7p7KSktE", "CCcWm6ynFdjhXav50RYX", "suUKeHzdp8nHVxF7bzfS", "M35OcI1OQnaGQWKxc9I1", "VcPPk81DkX9SMh0xDLF0", "HCgk1Fx56jylpD7t05ZB", "Ow0XjKjuI4JvkzwH4ur1", "stglrhpzLlEsJfZZFtBD", "RcSkxta0LpI5ErUUVdDV", "Sw7bybs3auydb5gKXnPh", "A35zhUpVGa7P0xi9dt6b", "R57Cy4gn7Bo3cvBtc98F", "aFVv1WFoxEG1dOqUClLa", "qh4cTXgAZF5DFWnVotUa", "RtdO0ONgxAupmiItQgTZ", "2qYZZx6U5TyJSDXIqJ5T", "6c1SaUzR2rRdimFck9aS", "6gvrWDRrmNtNkWyapeH5", "ryFhFnJgSusM0RVPBW2f"]
  },
  {
    name: "Sveikata ir ekologija",
    ids: ["JGRyjsYXFtuxm7DAz9FE", "fi05rI0qPHSNkEMCY32R", "oPeaGHyPeOdFXx0SpHgl", "827thEXJvqpe7oQfj0hv", "UGI9ZB4fNI9jkfOuZlWi", "VEBafVbzZ2mNQk28BkXf", "BDtaQsW4qxU3T2OwuXYo", "EBNuHoVEMQaQ7TG3PlTL", "qKLdJThRZFB6Rx9APCMW", "TujjzOITksdMIv9M6rg5", "fjZN6AVK2Uhd7GSMwm8U", "Bef0HAhBfLX04GXqeHDO", "nwBr9s6IIV9ptLkNmHIJ", "wIRlTUmYa2SfVJH7YU1c", "gMnZ8EW2O8ni8wByqMyG", "OhLiYna3qGZvoqX2izBr", "YFneeNr65XZjs6hTJ97P", "6tueHF11c9W3Q2mzUu9I", "KDJAs83dAI7wvtsbLN9s", "6EqPxxzRDcltV82ubiFg", "WLqsdHRFYcmMXguMZ4jt", "nq6VXSyqODfraIeAHlOd", "0S2VgAvxqSOKAl5wtBnA", "piQ88fzAslQiJmJOCMej", "deBw9meYGTbtvsaOiHnz"]
  },
  {
    name: "Naminiai gyvūnai",
    ids: ["Zhqe15hiHPBB2wDIucxM", "0ANpirdIGoSM9c7giFz2", "Hn44vpwMPRAZA8yimN6C", "QxjA04sAwo1huEAyFa8v", "em7Ut4pXnntmMur31sYC", "X1rqK9kHen40uKkVstmC", "3fw7y1oHodQX0zn4Hlip", "6ZlAZBiEUcrwykxbQeHN", "60zYa81BCMQxBQ06s5Qk", "p4dMh2eluMrsgMupe2vr", "JOdQiND9cS9j5LEburzI", "8uU2IzIBF28y9SlzDhJk", "D8by0r8MogsXtNkWPyrv", "gC2DRSmviggApkGVcPuU", "f8ZXBoGHVVTd96WFK8sx", "BEMtECdJ8kYroO9er59a", "L2IxWYq33mHINJjmfHgV", "PDVqW4Da93DqFXupBp7Q", "nmTjSZXSYiztRjga9R33", "gWEzspMi4mdzUfPk4ryi", "Lkw5T1L7E2913soPGpcU", "rlYDR5uWUMn5BsbtpVUX", "ehL407SFHeouHtY6HBAk", "ZWKT3LvpULx5vcGZe0pN", "vrv8IDuhmh35cmen2vXm", "3R23UGibCoVkdzqZTyC5", "wfuE1UUlddwsnfGnsYiS", "6Y8DSlCpZ22281iNTM1l", "IJyR8Eeyu72w0XUes8Yj", "w7wOlLt6404i6EmazU6K", "ZU6TLjiBqkl5bKFXquRj", "G9ZZ5s7fUUJyMtUO6DtL", "SVRR0IuPsj75UJfLDSvd", "S4wxxXSlTQbGzE83IwQo", "FmiC1VNHfqQq7JSvKLek", "UzsVWAQokgV1YkmztPHA"]
  },
  {
    name: "Nekategorizuota 1",
    ids: ["9hyynqBXX4U9mME5d1Ap", "fbL8fKg1uvLESbnBR7tC", "dlJZVv5rlHDT8q7X6Jvm", "ctbLOVmfK5jVjcSmMPf8", "i2FrWQwwx6rSMHKgZE8V", "G122tDvOibDSuDp1vnJ6", "YuQnZZyah3fLnFRsRw32", "Co7qY2el6NfBo59CpkhA", "VaFdgkYkE3WCpzJmJ4ju", "euobko4AmcVTPkRtoFdt", "V7bHCnKHPoEqKZQWOCh6", "ViEEpkYiWRsvW55FyHfL", "KBPjk3XT5hRr2KNeoqsC", "yIUemGUAmzg77Z4O202g", "qbfl8K8L2utXqhalPeNU", "fbmB94GGmON49Zkem5JG", "u9kIAKXGJ40zgKLXVoAy", "OlBPQ0xNj53IqpF2RTpQ", "NHni7z66BHyywjTw2OOB", "UKuEUyMqxZJM3jCPRgUi", "8bMQmQJSuVCPeU6qblie", "flkbhsUHz52dwTyzSCTr", "epM1vaWjkSav8VKgKDTO", "aVJxjqMhyURUuxiTMVNE", "QT1oob0AtYe22ldjxZJg", "9wAKv7gfWv49S0zTk3dz", "HT3j8kkuJcZHSBlqF5a8", "kqhgj2O9pa7rxh787759", "tMgVQbFBNU7gRprIM7Lx", "XAod2816YXtgCRr0p7PN", "gBIH0njzGhODZihPFVsT", "pbOyDEAjbui1yqkiMhI3", "QvY7LlNKCs3dHtD3OtWg", "Z9HqEtpypNvSob90aEtV", "lYYz7idXTrhTspmdIN0G", "kJnf60KrHggsAscco0Zn", "KXkgbEVqe3lqCVC0o95V", "Pr3USaZN96M8JfZv7KdF", "GKmID31aLiuKKTZApGYF", "csvdSLdtnOrPBdJm71di", "ONFsK1JyWoLZ6bhPtnlV", "eLmwz7ncKCSSwP5UveXf", "Yeq1FaZPZKIz29M4OfKq", "RnwFMrVmx1wZuPtdWPvk", "tyt3oEM8czJSoIIEYCEJ", "mWLxb0zmvxZ9kiGDYdtm", "iIWLnsPpujjmbDYy6IfD", "t2B65LkqqVf5sFNsUSer", "GgSak4aghfULJWvqwE6z", "AZwhZEdyfUuY73xDPFv3", "DdzYauaVhn7DAVZz9UCz", "9X2P7FYMZcAXuXFkKUPw", "W9zBPeOYBChksdCBmfJF", "ImPLeYYFGuvyDUZd6NHn", "EPK2EdDeCoeAOlJg7ioD", "rgJQLjzoOHbLYP4KoaWK", "8j2cHt5xgKxUV6XQpsnh", "oD5mN0pQNU7yM2pxjnQ6", "Sw0nkVIG3dXZFkCy21SO", "vCe1BSKjvx0NCLdjd71o", "QHJyJP0pyov01Bz4eNZ7", "c2fIVTSefoItjAAXuCQU", "rMTbCN76mChTKz4RzQ1D"]
  },
  {
    name: "Nekategorizuota 2",
    ids: ["QUTCAju3uNoOz3gNDZU8", "XcGwt4VnFgac1Xa4Tdyb", "7EozHDe1FzwjfpR8izFz", "GuEXEZUHIz4nyTist094", "7LNocErha2cs71YxtV9K", "UU3piQ2g4YsJ60anJlyd", "TkerQAZqYszRXBnScEWa", "ILll0f3BqO4eB5k4LMyE", "HkZRCAYdy8qpyizPY5s8", "LssxOu8dhgvkuyJPBOZm", "mof0rTBrBrxe4wUxWmoU", "WFldxcj0CsBIXshmjP4l", "Vq2SilMlLx0SOkdq18G3", "E6ofaNNrHpMZaWrTLq5P", "nT0V4Q6G6XgXPRZ6jJCL", "I9UJIutBWqqgJ0FCMNdB", "P0sXnmji1rIdP2NwLTqN", "OzBMhrzADUvmgQxjZ840", "t06PvS8VAsuvA0NfirNo", "zA2FtxaVhFY86o8HIbZz", "02fFenKoCZJNnh6beJhP", "fIsM2ykw1rGiukwlk2cD", "SvexNaz4ax5bOAt2ocv8", "WfkLROWLA041iJrdsNvV", "QEhNbzzsk4Ex2c34AHOs", "zVExYeqDXAhFLUGwnzWD"]
  },
  {
    name: "Nekategorizuota 3",
    ids: ["ZGANHCTUJPIkyiwGVFfq", "wDO2EwXd5ibMYdl9931D", "IYyxhNfiDvL1WTKjovNh", "TL1C3m9OQRdIQRKFpQ08", "v2bpMfVJWDW31FluTmfC", "BUBiaWog0LZSkjtQ7a3m", "SQgPCBQyzEUTXUiDtBvx", "SA6zqF9PeuK2BvMR683Z", "4JCRAlmn8qltTrx5iUjj", "sPAXRnZ0zKVflj0ckgfc", "sbFdiAgOXJcMWf835ECb", "FXURX9ApocWp4HVzb0kg"]
  },
  {
    name: "Nekategorizuota 4",
    ids: ["PJhSgv0diBUuK8xAAv6a", "gNyhoOgkFfhTbm4Kqv4C", "5Ec88B8Y5d7N9lSzTbXj", "y4y33cCp9oH68T47fHg4", "YicBqqOfJLto3IlEe9yN", "3XwBWCXWN3BlXLnh3IaJ", "gb8mLzR7sKcuk2XAGAsD"]
  },
  {
    name: "Nekategorizuota 5",
    ids: ["4FKjJo0wtrRIsN75QBqs", "LeH6Ps8LKddIXe2fRx1Y", "xSjgKPLK5xkWYk28vs74", "5puGUBEg7Wf13GYqIjlD", "gYxZS254Yer5D0DhtVvw", "EBRah4ZyZPflAqbBwciD", "V6FQLLYZAcG5D2fDhPYR", "FmwfgzaL5aUBDhtgl1E0", "j8OtrHfhfFDSAwCL3h11", "fdBGZ3qUTdlDJgY0USKB"]
  },
  {
    name: "Nekategorizuota 6",
    ids: ["MX0S8ioXYGk0oFu0Npr3", "5nTFLKOirv3psqRlwIyr", "nDgWSgS6hLC2dtO94GOD", "ZYpJkjkQ0B4zAtFyxHnr", "dZTU4pfEh6f5IGeqZcid", "ga77piYhMOacoYSwO2iS", "HNavhdQ5SRGGGOrKqhY2", "CxtaRHC73OCpeKEh64oD", "1r0afjY0W5ZlZ4VFYXnf", "GINUItdXnjiFbq5dOCnq", "bslrbpbzlk2dGHbVhHtX", "UF49bttVHT5BBkXaWoSW", "3MvvS95hNIldMSh8P6vD", "M4cxk0HgfBG3aoTZ4Mo9", "qx6JGKQDU9P5f5LO2C1k", "JnMoktmb4bt78N2Cjugm", "xlYpqH1ja9VeaWQfZTLw", "phzPOaAR95OltbG8F518", "BLhcfptJb5SbXvvquLgY", "4x9zfcRToptKTt1kw1GE", "wF9j8joI6Y7qAas4s9dg", "HcBpJvPn3JVsqceOwaOi", "pNjbfzGJXg6pmTR4R5kw", "b4lS9Eubl0AXaRDOCebs", "fFBfJychavm3pPNrr1IM", "kQ4FTBneEfv7wx2A2kIa", "lYVjfNJ6NBm2pVC93zUr", "K7yx2Dge30uu5hMsI7yF", "kyEf2GWUTVmbKSJwgCzu", "bIrpqEhbSG3ZSAT0DEc1", "kbFsZisYbofSRhbIn4eD", "92CV8nx1CSs8TsaSFrry", "yVlOySfR9voY9meVtIsd", "Q5kAPUryKxX2XRVBV0Fr"]
  },
  {
    name: "Nekategorizuota 7",
    ids: ["u1xtUyZCvhRsHSsMXgeu", "rfrdMoDspW7nqxUlPND2", "CuKYhe5SRsscYP4CEFH0", "WRQDAv6Wq0NOFwiWLdKY", "GTtv7NcOoC62uZWsa32c", "jPveYiQccR2avtnzeVnf", "c4C2pvnejKEAwbAhrjcb", "RnMLyBnSAEddnW0xp357"]
  },
  {
    name: "Nekategorizuota 8",
    ids: ["rDAC25E8Fp9Ea09ghz4u", "vKZSqGWUxigbLoE5zXzC", "hyy64UVqiwmfZzRCCRQK", "XfkhbXBJyXD46vEeHlLX", "oqR497yhzUDILPpNAyge", "KoXr4t0TtnlDNPnB84LI", "EPei3OrnlS7B8U8FBexr", "JvNo03ykzhGJS9bwna7t", "nYzHtR9Ce3vmDe3LlZL0", "azOUrEM30DyfYYevCIs9", "Lc5mkXBinNp28YTOLA14", "uT7ms6tn1gG7Coa0HCle", "JFlomo0mDwfm2mNSu6Md", "pV7TCVkzSwvS4azXaL3h", "t44BlB2RpVruX4NBSuk0", "fyt9LorG3GsCfaC5dIyp", "GOdtcsf0LCK65sPxjBCN", "koiNRkeDZCyZUBZAAIen", "DNwnxO3xQpCz9aIkxi02", "sR89RIxYS5x9n6f9UsN5", "BlAgXYT0VczksFLzUFb8", "TSAt84J3wHtpzs7moYu1", "ZhioRjTBE5Hn85s4owLl", "aImWXuhzExFxJmoYtnfu", "JqLfXOxcRO9lTIih6PkI", "o6zEy5m2coeQGFsmXCPz", "5MfkfdaajZNnJ52XRX8O", "ICgUHfAT2LjyKveoCM29", "vdZTovxMdiI5Zt5NpVOj", "nlg2MnVSIW4EKKcqNkBR", "8LefQgAzrzNH5lnQNB8s", "hZLokg1liRlgr4lsQOdV", "3HXcS3o3WzQZx7UZn2Vh", "51YHVGLCiEn7EPaSZkqP", "mZI20NyOX7Y3yH9WAtmQ", "JzFKl3VlL8wV66BvXQXt", "U5CCSOxIF9reJCvlcvfq", "fjQl3HXRlRRLkOfppm9L", "RmScTuzsFQZkhTbIKXq8", "FiRJwV5zToRee3ANhP0b", "vQNQIoaNmNfCKgn8jnX1", "ieHBWYEeTJgFBiZHgug5", "LWIQGw76hDsPmcDlHW2q", "v7tbv3sL132YVCMQSqmf", "PnxBh32OpqGXTeOIu2z6", "ur1by0DqXhWpsA3qoeiI", "C3crqgk6FXsIiyfphlI1", "oaIPFmZ7uaplaaPMRuCN", "Rqyn2B7TbmJJW9lN7Kkn", "Z6gvh1eDCUWFRRJvuyeV", "0a7qqKDAgJKISICPLt4X", "gHO4UXWFMwzpChE1Q1ms", "4t0atvlojQqrEWKsH5c5", "fyTGphuGjEpitxr5wywh", "0Bn5t9syCJ7YkeNOPE1G"]
  },
  {
    name: "Nekategorizuota 9",
    ids: ["inJVHiKlG6dUt7qdnCPu", "LMDXOnrE19iH4s51VKYf", "xSicE9DGNsykAvG5hoJF", "4yi8Mzz5RAJUr4LjHnDM", "qZYXF9mmilxjTBWTvve9", "FfSVwoVbLvEvTLZ2HH6a", "52kzzZO41ZZiwcYN5Sl5", "VibNeG65YpAorl3K8M93"]
  },
  {
    name: "Nekategorizuota 10",
    ids: ["GO8WxZXxw3X76P3T69pv"]
  },
  {
    name: "Nekategorizuota 11",
    ids: ["ITwZS99dpaku1sL9pMIW", "tW5gApdbjIENZAbRBxZD", "XZ8CPQSWZh8cwxxJalkY", "L9U8tAmR4JaMUywE8RTs", "Q8XQstKHkyaRBlipwgCF", "7QoYNabqNUcjvW279exa", "L3eOJdVaE1bPVgnmxQvc", "yGHynkIjuc7gQJoXGFNf", "PUrqI4cndxLkgzZNL8Td", "Kk7VVRl1okesePEuc0gS", "ojQUgHcmqOSc2pBFkCvA", "HMqqkjDyddqmd5KSQu4H", "8sDj5nNkPkaOPXclpgBp", "uf3nyrLASrli1l3XRfE0", "W8fJ7gx7lnvN8ihkaqmu", "bSbmVtZgp9jupQdFTxgC"]
  },
  {
    name: "Nekategorizuota 12",
    ids: ["IDY83P7ompWJ9gbrzbYT", "QGOCKOUh5CGzUc5xfBU9", "4CICOuccQmr2b4d1Qhv2"]
  }
];

const CONCURRENCY = Number(process.env.IKI_CONCURRENCY ?? 3);

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

const randomDelay = (min: number, max: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

interface LastMilePrc {
  p: number;
  l: number | null;
  ltill: string | null;
}

interface LastMileProduct {
  chainId: string;
  categoryId: string;
  unitOfMeasure: string;
  conversionMeasure: string;
  thumbUrl?: string;
  photoUrl?: string;
  prc: LastMilePrc;
  isInStock: boolean;
  isActive: boolean;
  isApproved: boolean;
  slugs: string[];
  name: Record<string, string>;
  productId: string;
}

interface LastMileApiWrapper {
  frontEndProduct: LastMileProduct;
  position?: number;
  karmaAdjustment?: any;
}

// API kartais sumažina leistiną limit (klaida "search_limit_too_large") – tada automatiškai mažinam.
const LIMIT_STEPS = [1000, 500, 300, 200, 100, 50];
let limitIdx = 0;
const currentLimit = () => LIMIT_STEPS[limitIdx];

interface FetchResult {
  items: LastMileApiWrapper[];
  count: number; // bendras prekių skaičius kategorijoje pagal API (0 jei nežinomas)
}

async function fetchProducts(categoryIds: string[], sort?: string, attempt = 1): Promise<FetchResult> {
  const limit = currentLimit();
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.lastmile.lt",
        Referer: "https://www.lastmile.lt/chain/IKI",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        params: {
          type: "view_products",
          isActive: true,
          isApproved: true,
          chainIds: [IKI_CHAIN_ID],
          categoryIds,
          isUsingStock: true,
          filter: {},
          ...(sort ? { sort } : {}),
        },
        limit,
      }),
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      if (res.status === 400 && body.includes("search_limit_too_large") && limitIdx < LIMIT_STEPS.length - 1) {
        // mažinam tik jei kita lygiagreti užklausa jau nesumažino
        if (currentLimit() === limit) {
          limitIdx++;
          console.warn(`   ↘️ API atmetė limit=${limit}, bandoma su ${currentLimit()}...`);
        }
        return fetchProducts(categoryIds, sort, attempt); // be bandymo skaičiaus didinimo
      }
      throw new Error(`HTTP ${res.status}${body ? ` – ${body}` : ""}`);
    }

    const json: any = await res.json();

    const items: LastMileApiWrapper[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.items)
          ? json.items
          : Array.isArray(json?.products)
            ? json.products
            : [];

    return { items, count: typeof json?.count === "number" ? json.count : 0 };
  } catch (err) {
    if (attempt <= 3) {
      console.warn(`   ⚠️ Užklausa nepavyko (bandymas ${attempt}/3): ${(err as Error).message}. Bandoma iš naujo...`);
      await randomDelay(1500 * attempt, 2500 * attempt);
      return fetchProducts(categoryIds, sort, attempt + 1);
    }
    console.error(`   ❌ Nepavyko po 3 bandymų kategorijoms [${categoryIds.slice(0, 2).join(", ")}...]:`, err);
    return { items: [], count: 0 };
  }
}

/**
 * API duoda daugiausia `limit` (dabar 100) prekių. Jei kategorija didesnė, papildomai kraunam
 * ta pačią kategoriją su kita tvarka (kaina didėjančiai / mažėjančiai) ir sujungiam – taip
 * pasiekiam abu galus. Veikiančios reikšmės rastos testais: priceAsc, priceDesc, price_asc.
 */
const EXTRA_SORTS = ["priceAsc", "priceDesc", "price_asc"];

async function fetchAll(categoryIds: string[]): Promise<FetchResult> {
  const first = await fetchProducts(categoryIds);
  if (first.items.length < currentLimit() * 0.95) return first;

  const byId = new Map<string, LastMileApiWrapper>();
  const add = (list: LastMileApiWrapper[]) => {
    for (const w of list) {
      const id = w.frontEndProduct?.productId;
      if (id && !byId.has(id)) byId.set(id, w);
    }
  };
  add(first.items);
  for (const sort of EXTRA_SORTS) {
    add((await fetchProducts(categoryIds, sort)).items);
  }
  return { items: [...byId.values()], count: first.count };
}

function mapUnit(conversionMeasure: string, unitOfMeasure: string): string {
  const c = (conversionMeasure || "").toUpperCase();
  if (c === "KG") return "kg";
  if (c === "L") return "l";
  const u = (unitOfMeasure || "").toUpperCase();
  if (u === "KG") return "kg";
  if (u === "L") return "l";
  return "vnt.";
}

function toProduct(wrapper: LastMileApiWrapper): Product | null {
  const p = wrapper.frontEndProduct;
  if (!p || p.chainId !== IKI_CHAIN_ID) return null;
  if (!p.isActive || !p.isApproved) return null;

  const name = p.name?.lt || p.name?.en || Object.values(p.name || {})[0];
  if (!name) return null;

  const regularPrice = p.prc?.p;
  const loyaltyPrice = p.prc?.l;
  if (typeof regularPrice !== "number" || regularPrice <= 0) return null;

  const currentPrice = typeof loyaltyPrice === "number" && loyaltyPrice > 0 ? loyaltyPrice : regularPrice;
  const isOnSale = typeof loyaltyPrice === "number" && loyaltyPrice > 0 && loyaltyPrice < regularPrice;

  const slug = p.slugs?.[0];
  const url = slug ? `https://www.lastmile.lt/chain/IKI/product/${slug}` : `https://www.lastmile.lt/chain/IKI`;

  const storePrice: StorePrices = {
    store: "IKI",
    price: currentPrice,
    ...(isOnSale && { oldPrice: regularPrice }),
    isOnSale,
    measurementUnit: mapUnit(p.conversionMeasure, p.unitOfMeasure),
    url,
  };

  return {
    id: "iki-" + p.productId,
    name,
    description: name,
    prices: [storePrice],
    imageUrl: p.thumbUrl || p.photoUrl || undefined,
  };
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/ę/g, "e")
    .replace(/ė/g, "e")
    .replace(/į/g, "i")
    .replace(/š/g, "s")
    .replace(/ų/g, "u")
    .replace(/ū/g, "u")
    .replace(/ž/g, "z")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

(async () => {
  const startedAt = Date.now();
  console.log(`🚀 IKI (per LastMile) V2 – lygiagrečiai grupių: ${CONCURRENCY}\n`);

  const dataDir = path.join(__dirname, "data", "iki");
  fs.mkdirSync(dataDir, { recursive: true });

  const seenIds = new Set<string>();
  let totalSaved = 0;
  let totalMissing = 0; // prekės, kurių API neatidavė dėl limit

  await runPool(IKI_CATEGORY_GROUPS, CONCURRENCY, async (group, i) => {
    const tag = `[${i + 1}/${IKI_CATEGORY_GROUPS.length}]`;
    console.log(`${tag} Kraunama: "${group.name}" (${group.ids.length} subkategorijos)...`);

    let items = (group.ids.length === 1 ? await fetchAll(group.ids) : await fetchProducts(group.ids)).items;

    // Jei rezultatas atrodo apkarpytas (limit 1000) – kraunam po subkategoriją, po kelias vienu metu.
    if (items.length >= currentLimit() * 0.95 && group.ids.length > 1) {
      console.log(`${tag} ⚠️ ${items.length} įrašų – atrodo apkarpyta, kraunama subkategorijomis...`);
      items = [];
      await runPool(group.ids, 3, async (singleCategoryId) => {
        const single = await fetchAll([singleCategoryId]);
        if (single.count > 0 && single.items.length < single.count) {
          const missing = single.count - single.items.length;
          totalMissing += missing;
          console.warn(`${tag} ⚠️ subkategorija ${singleCategoryId}: gauta ${single.items.length} iš ${single.count} (trūksta ${missing})`);
        }
        items.push(...single.items);
        await randomDelay(100, 300);
      });
    }

    const groupProducts: Product[] = [];
    for (const wrapper of items) {
      const productId = wrapper.frontEndProduct?.productId;
      if (!productId || seenIds.has(productId)) continue;

      const product = toProduct(wrapper);
      if (!product) continue;

      seenIds.add(productId);
      groupProducts.push(product);
    }

    if (groupProducts.length > 0) {
      const fileName = `iki_${sanitizeFileName(group.name)}.json`;
      fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(groupProducts, null, 2), "utf-8");
      totalSaved += groupProducts.length;
      console.log(`${tag} ✅ ${group.name}: ${groupProducts.length} unikalių → data/iki/${fileName}`);
    } else {
      console.log(`${tag} ⚪ ${group.name}: naujų produktų nėra`);
    }
  });

  const secs = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n🎉 IKI baigta! Iš viso unikalių produktų: ${totalSaved} | Trukmė: ${secs}s`);
  if (totalMissing > 0) console.log(`ℹ️ IKI: dėl API limito nesurinkta apie ${totalMissing} prekių.`);

  // Jei nesurinkta nieko – tai klaida (API neatsakė / užblokavo), o ne sėkmė.
  if (totalSaved === 0) {
    console.error("❌ IKI: nesurinkta nė vienos prekės – žr. klaidas aukščiau.");
    process.exit(1);
  }
})();