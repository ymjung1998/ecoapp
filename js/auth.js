const loginForm = qs("#loginForm");
const signupForm = qs("#signupForm");
const tabLogin = qs("#tabLogin");
const tabSignup = qs("#tabSignup");

let isSubmitting = false;

function activateTab(tab) {
  hideMessage();

  if (tab === "login") {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    loginForm.classList.add("active");
    signupForm.classList.remove("active");
  } else {
    tabLogin.classList.remove("active");
    tabSignup.classList.add("active");
    loginForm.classList.remove("active");
    signupForm.classList.add("active");
  }
}

function setSubmittingState(submitting) {
  isSubmitting = submitting;

  const buttons = document.querySelectorAll("button");
  buttons.forEach(button => {
    if (button.id !== "tabLogin" && button.id !== "tabSignup") {
      button.disabled = submitting;
    }
  });
}

tabLogin.addEventListener("click", () => activateTab("login"));
tabSignup.addEventListener("click", () => activateTab("signup"));

async function redirectIfLoggedIn() {
  try {
    const user = await getCurrentUser();
    if (user) {
      window.location.href = "./projects.html";
    }
  } catch (error) {
    console.error(error);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (isSubmitting) return;

  hideMessage();

  const loginId = qs("#loginId").value.trim();
  const password = qs("#loginPassword").value.trim();

  if (!isSixDigitNumber(loginId)) {
    showMessage("아이디는 6자리 숫자여야 합니다.", "error");
    return;
  }

  if (!isSixDigitNumber(password)) {
    showMessage("비밀번호는 6자리 숫자여야 합니다.", "error");
    return;
  }

  try {
    setSubmittingState(true);

    const email = makeInternalEmail(loginId);

    const { error } = await window.sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      const message = String(error.message || "").toLowerCase();

      if (message.includes("invalid login credentials") || message.includes("invalid_credentials")) {
        throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
      }

      throw error;
    }

    showMessage("로그인에 성공했습니다.", "success");

    setTimeout(() => {
      window.location.href = "./projects.html";
    }, 300);
  } catch (error) {
    showMessage(error.message || "로그인 중 오류가 발생했습니다.", "error");
  } finally {
    setSubmittingState(false);
  }
}

async function handleSignup(event) {
  event.preventDefault();
  if (isSubmitting) return;

  hideMessage();

  const name = qs("#signupName").value.trim();
  const loginId = qs("#signupId").value.trim();
  const password = qs("#signupPassword").value.trim();

  if (!name) {
    showMessage("이름을 입력하세요.", "error");
    return;
  }

  if (!isSixDigitNumber(loginId)) {
    showMessage("아이디는 6자리 숫자여야 합니다.", "error");
    return;
  }

  if (!isSixDigitNumber(password)) {
    showMessage("비밀번호는 6자리 숫자여야 합니다.", "error");
    return;
  }

  try {
    setSubmittingState(true);

    const email = makeInternalEmail(loginId);

    const { data: signUpData, error: signUpError } = await window.sb.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      const message = String(signUpError.message || "").toLowerCase();

      if (message.includes("email rate limit exceeded")) {
        throw new Error("회원가입 요청이 너무 많아 잠시 제한되었습니다. 잠시 후 다시 시도하거나, 이미 가입된 계정이면 로그인해 주세요.");
      }

      if (message.includes("user already registered")) {
        activateTab("login");
        qs("#loginId").value = loginId;
        throw new Error("이미 가입된 아이디입니다. 회원가입 대신 로그인해 주세요.");
      }

      throw signUpError;
    }

    const user = signUpData?.user;

    if (!user) {
      throw new Error("회원가입 후 사용자 정보를 가져오지 못했습니다.");
    }

    const { error: profileError } = await window.sb
      .from("profiles")
      .insert({
        id: user.id,
        name,
        login_id: loginId,
        role: "user"
      });

    if (profileError) {
      const profileMessage = String(profileError.message || "").toLowerCase();

      if (profileMessage.includes("duplicate") || profileMessage.includes("unique")) {
        activateTab("login");
        qs("#loginId").value = loginId;
        throw new Error("이미 사용 중인 아이디입니다. 로그인해 주세요.");
      }

      throw profileError;
    }

    const { error: loginError } = await window.sb.auth.signInWithPassword({
      email,
      password
    });

    if (loginError) {
      showMessage("회원가입이 완료되었습니다. 이제 로그인해 주세요.", "success");
      activateTab("login");
      qs("#loginId").value = loginId;
      qs("#loginPassword").value = "";
      return;
    }

    showMessage("회원가입이 완료되었습니다.", "success");

    setTimeout(() => {
      window.location.href = "./projects.html";
    }, 300);
  } catch (error) {
    showMessage(String(error.message || "회원가입 중 오류가 발생했습니다."), "error");
  } finally {
    setSubmittingState(false);
  }
}

loginForm.addEventListener("submit", handleLogin);
signupForm.addEventListener("submit", handleSignup);

redirectIfLoggedIn();