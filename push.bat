@echo off
echo ======= PUSH TO GITHUB =======
echo Author Date: 2025-11-19
set GIT_COMMITTER_DATE=2025-11-19T12:00:00
set GIT_AUTHOR_DATE=2025-11-19T12:00:00

git add .
git commit -m "initial vibe release"
git branch -M main
git push https://github.com/astoriel/tabiko.git HEAD:main -f

echo.
echo ======= DONE =======
pause
